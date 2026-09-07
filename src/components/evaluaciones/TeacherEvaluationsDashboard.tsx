import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Clock, Users, User, X } from "lucide-react";
import {
  useEvaluaciones,
  showEvaluacionSaveError,
  isTrimestreValue,
  TRIMESTRE_VALUES,
  buildEvaluationIndex,
  evaluationLookupKey,
  type EvaluacionCreateInput,
  type EvaluacionData,
  type EvaluacionUpsertItem,
} from "@/hooks/useEvaluaciones";
import {
  buildTeacherRoster,
  useTeacherHorarios,
  type TeacherHorarioGroup,
  type TeacherHorarioRow,
  type TeacherHorarioStudent,
} from "@/hooks/useTeacherHorarios";
import { useActiveTenant } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";
import { useRubricas, filterActiveRubricas, type RubricaData } from "@/hooks/useRubricas";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { useGrupos } from "@/hooks/useGrupos";
import {
  buildResultadosRubricaByLabel,
  computeAutoNotaMediaFromCriteria,
  initCriterioGradeValues,
  parseRubricCriteria,
  type RubricCriterion,
} from "@/lib/rubricStructure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const RUBRICA_NONE_VALUE = "__none__";

function isHorarioActivo(row: TeacherHorarioRow): boolean {
  return (row.ESTADO ?? "").trim().toLowerCase() === "activo";
}

type TeacherCursoOption = {
  ID_CURSO: string;
  NOMBRE_CURSO: string;
  ESTADO: string | null;
  FECHA_INICIO: string | null;
  FECHA_FIN: string | null;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isCursoVigente(curso: TeacherCursoOption | undefined): boolean {
  if (!curso?.FECHA_INICIO || !curso.FECHA_FIN) return false;
  const today = todayIsoDate();
  return curso.FECHA_INICIO <= today && today <= curso.FECHA_FIN;
}

function pickDefaultCursoId(cursos: TeacherCursoOption[]): string {
  if (cursos.length === 0) return "";
  const covering = cursos.find((c) => isCursoVigente(c));
  if (covering) return covering.ID_CURSO;
  return [...cursos].sort((a, b) => (b.FECHA_FIN ?? "").localeCompare(a.FECHA_FIN ?? ""))[0]
    .ID_CURSO;
}

type GroupRowDraft = {
  idAlumno: string;
  idEspecialidad: string;
  nombreAlumno: string;
  nombreEspecialidad: string;
  notaMedia: string;
  comentarios: string;
  criterios: Record<string, string>;
  existingId?: string;
};

type IndividualRubricBatch = {
  id: string;
  rubricaId: string;
  studentKeys: string[];
};

function studentKey(student: TeacherHorarioStudent): string {
  return `${student.idAlumno}::${student.idEspecialidad}`;
}

function rubricaLabel(rubricaId: string, activeRubricas: RubricaData[]): string {
  if (!rubricaId) return "Sin rúbrica (nota simple)";
  return activeRubricas.find((r) => r.ID_RUBRICA === rubricaId)?.NOMBRE ?? "Rúbrica";
}

function seedIndividualBatches(
  students: TeacherHorarioStudent[],
  trimestre: string,
  evaluationIndex: Map<string, EvaluacionData>,
  profesorId: string,
  activeRubricas: RubricaData[],
): IndividualRubricBatch[] {
  const byRubric = new Map<string, string[]>();

  for (const student of students) {
    const existing = evaluationIndex.get(
      evaluationLookupKey(trimestre, student.idAlumno, student.idEspecialidad, profesorId),
    );
    if (!existing) continue;

    const rubricaId =
      existing.ID_RUBRICA && activeRubricas.some((r) => r.ID_RUBRICA === existing.ID_RUBRICA)
        ? existing.ID_RUBRICA
        : "";

    const key = studentKey(student);
    const list = byRubric.get(rubricaId) ?? [];
    list.push(key);
    byRubric.set(rubricaId, list);
  }

  return [...byRubric.entries()].map(([rubricaId, studentKeys], index) => ({
    id: `seed-${rubricaId || "none"}-${index}`,
    rubricaId,
    studentKeys,
  }));
}

function assignStudentsToRubric(
  batches: IndividualRubricBatch[],
  rubricaId: string,
  keys: string[],
): IndividualRubricBatch[] {
  if (keys.length === 0) return batches;

  const existing = batches.find((batch) => batch.rubricaId === rubricaId);
  if (existing) {
    const merged = Array.from(new Set([...existing.studentKeys, ...keys]));
    return batches.map((batch) =>
      batch.id === existing.id ? { ...batch, studentKeys: merged } : batch,
    );
  }

  return [
    ...batches,
    {
      id: crypto.randomUUID(),
      rubricaId,
      studentKeys: keys,
    },
  ];
}

function removeStudentFromBatches(
  batches: IndividualRubricBatch[],
  key: string,
): IndividualRubricBatch[] {
  return batches
    .map((batch) => ({
      ...batch,
      studentKeys: batch.studentKeys.filter((studentKeyValue) => studentKeyValue !== key),
    }))
    .filter((batch) => batch.studentKeys.length > 0);
}

function batchToSyntheticGroup(
  batch: IndividualRubricBatch,
  studentByKey: Map<string, TeacherHorarioStudent>,
  activeRubricas: RubricaData[],
): TeacherHorarioGroup {
  const label = rubricaLabel(batch.rubricaId, activeRubricas);
  const students = batch.studentKeys
    .map((key) => studentByKey.get(key))
    .filter((student): student is TeacherHorarioStudent => Boolean(student))
    .sort((a, b) => a.nombreAlumno.localeCompare(b.nombreAlumno, "es", { sensitivity: "base" }));

  return {
    idGrupo: batch.id,
    nombreGrupo: label,
    nombreEspecialidad: label,
    label,
    students,
  };
}

const inlineInputClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function EvaluationStatusBadge({ evaluated }: { evaluated: boolean }) {
  if (evaluated) {
    return (
      <StatusBadge status="success" className="shrink-0 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Evaluado
      </StatusBadge>
    );
  }
  return (
    <StatusBadge status="pending" className="shrink-0 gap-1">
      <Clock className="h-3 w-3" />
      Pendiente
    </StatusBadge>
  );
}

function RubricSelector({
  label,
  value,
  onChange,
  rubricas,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  rubricas: RubricaData[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value || RUBRICA_NONE_VALUE}
        onValueChange={(next) => onChange(next === RUBRICA_NONE_VALUE ? "" : next)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Sin rúbrica" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={RUBRICA_NONE_VALUE}>Sin rúbrica (nota simple)</SelectItem>
          {rubricas.map((r) => (
            <SelectItem key={r.ID_RUBRICA} value={r.ID_RUBRICA}>
              {r.NOMBRE}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function formatNotaMediaInput(value: number | string | null | undefined): string {
  if (value == null) return "";
  return String(value);
}

function parseNotaMediaForSave(
  notaRaw: string,
  contextLabel?: string,
): { ok: true; value: number | string } | { ok: false; message: string } {
  const trimmed = notaRaw.trim();
  if (!trimmed) {
    return {
      ok: false,
      message: contextLabel
        ? `Introduce la nota final para ${contextLabel}`
        : "Introduce la nota final",
    };
  }

  const notaNum = Number(trimmed);
  if (Number.isFinite(notaNum)) {
    if (notaNum < 0 || notaNum > 10) {
      return {
        ok: false,
        message: contextLabel
          ? `La nota final de ${contextLabel} debe estar entre 0 y 10`
          : "La nota debe estar entre 0 y 10",
      };
    }
    return { ok: true, value: Math.round(notaNum * 100) / 100 };
  }

  return { ok: true, value: trimmed };
}

function resolveInitialRubricaId(
  existing: EvaluacionData | null | undefined,
  activeRubricas: RubricaData[],
): string {
  if (!existing?.ID_RUBRICA) return "";
  return activeRubricas.some((r) => r.ID_RUBRICA === existing.ID_RUBRICA)
    ? existing.ID_RUBRICA
    : "";
}

function StudentEvalCard({
  student,
  evaluated,
  onSelect,
}: {
  student: TeacherHorarioStudent;
  evaluated: boolean;
  onSelect: () => void;
}) {
  return (
    <Card className="cursor-pointer p-4 transition-colors hover:bg-muted/40" onClick={onSelect}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 max-[349px]:flex-col max-[349px]:gap-1.5">
        <div className="min-w-0 flex-1 max-[349px]:w-full">
          <p className="break-words font-medium leading-snug">{student.nombreAlumno}</p>
          <p className="break-words text-sm text-muted-foreground">{student.nombreEspecialidad}</p>
        </div>
        <EvaluationStatusBadge evaluated={evaluated} />
      </div>
    </Card>
  );
}

function TeacherIndividualEvalDialog({
  student,
  trimestre,
  idCurso,
  profesorId,
  evaluationIndex,
  activeRubricas,
  open,
  onClose,
  submitting,
  onSubmit,
  lockedRubricaId,
  lockTrimestre,
  readOnly,
}: {
  student: TeacherHorarioStudent;
  trimestre: string;
  idCurso: string;
  profesorId: string;
  evaluationIndex: Map<string, EvaluacionData>;
  activeRubricas: RubricaData[];
  open: boolean;
  onClose: () => void;
  submitting: boolean;
  onSubmit: (payload: EvaluacionCreateInput, existingId?: string) => void;
  lockedRubricaId?: string;
  lockTrimestre?: boolean;
  readOnly?: boolean;
}) {
  const [localTrimestre, setLocalTrimestre] = useState(trimestre);
  const [rubricaId, setRubricaId] = useState("");
  const [notaMedia, setNotaMedia] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [criterioValues, setCriterioValues] = useState<Record<string, string>>({});
  const rubricLocked = lockedRubricaId !== undefined;
  const effectiveTrimestre = lockTrimestre ? trimestre : localTrimestre;

  const existing = useMemo(
    () =>
      evaluationIndex.get(
        evaluationLookupKey(
          effectiveTrimestre,
          student.idAlumno,
          student.idEspecialidad,
          profesorId,
        ),
      ) ?? null,
    [evaluationIndex, effectiveTrimestre, student.idAlumno, student.idEspecialidad, profesorId],
  );

  const selectedRubrica = useMemo(
    () => activeRubricas.find((r) => r.ID_RUBRICA === rubricaId) ?? null,
    [activeRubricas, rubricaId],
  );

  const criteria = useMemo(
    () => parseRubricCriteria(selectedRubrica?.ESTRUCTURA),
    [selectedRubrica],
  );

  const usesRubric = criteria.length > 0;

  useEffect(() => {
    if (!open) return;
    setLocalTrimestre(trimestre);
  }, [open, trimestre]);

  useEffect(() => {
    if (!open) return;
    setRubricaId(
      rubricLocked ? (lockedRubricaId ?? "") : resolveInitialRubricaId(existing, activeRubricas),
    );
    setComentarios(existing?.COMENTARIOS ?? "");
    setNotaMedia(formatNotaMediaInput(existing?.NOTA_MEDIA));
  }, [open, existing, activeRubricas, rubricLocked, lockedRubricaId]);

  useEffect(() => {
    if (!open) return;
    setCriterioValues(initCriterioGradeValues(criteria, existing?.RESULTADOS_RUBRICA));
  }, [open, criteria, existing]);

  useEffect(() => {
    if (!usesRubric) return;
    const auto = computeAutoNotaMediaFromCriteria(criterioValues);
    if (auto != null) {
      setNotaMedia(auto);
    }
  }, [criterioValues, usesRubric]);

  const updateCriterio = (key: string, value: string) => {
    setCriterioValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            {readOnly ? "Ver evaluación" : "Evaluar alumno"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Alumno</p>
              <p className="font-medium">{student.nombreAlumno}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Especialidad</p>
              <p className="font-medium">{student.nombreEspecialidad}</p>
            </div>
          </div>

          {lockTrimestre ? (
            <div className="space-y-1">
              <Label>Trimestre</Label>
              <p className="text-sm font-medium">
                {effectiveTrimestre === "FINAL" ? "Final" : `Trimestre ${effectiveTrimestre}`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Trimestre *</Label>
              <Select
                value={localTrimestre}
                onValueChange={setLocalTrimestre}
                disabled={submitting || readOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIMESTRE_VALUES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t === "FINAL" ? "Final" : `Trimestre ${t}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <RubricSelector
            label={rubricLocked ? "Rúbrica del grupo" : "Rúbrica a utilizar"}
            value={rubricaId}
            onChange={setRubricaId}
            rubricas={activeRubricas}
            disabled={submitting || rubricLocked || readOnly}
          />

          {usesRubric ? (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Criterios de la rúbrica</p>
              {criteria.map((criterion) => (
                <div key={criterion.key} className="space-y-1">
                  <Label>{criterion.label}</Label>
                  <Input
                    type="text"
                    value={criterioValues[criterion.key] ?? ""}
                    onChange={(e) => updateCriterio(criterion.key, e.target.value)}
                    placeholder="Nota, letra o texto"
                    disabled={submitting || readOnly}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Nota final *</Label>
            <Input
              type="text"
              value={notaMedia}
              onChange={(e) => setNotaMedia(e.target.value)}
              placeholder="Ej. 8.50, A, Aprobado"
              disabled={submitting || readOnly}
            />
          </div>

          <div className="space-y-2">
            <Label>Comentarios</Label>
            <Textarea
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              rows={4}
              disabled={submitting || readOnly}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {readOnly ? "Cerrar" : "Cancelar"}
          </Button>
          {!readOnly && (
            <Button
              type="button"
              disabled={submitting || !notaMedia.trim()}
              onClick={() => {
                if (!isTrimestreValue(effectiveTrimestre)) {
                  toast.error("Selecciona un trimestre válido");
                  return;
                }

                let resultadosRubrica: Record<string, string | number> | null = null;
                if (usesRubric && criteria.length > 0) {
                  resultadosRubrica = buildResultadosRubricaByLabel(criteria, criterioValues);
                }

                const parsedNota = parseNotaMediaForSave(notaMedia);
                if (!parsedNota.ok) {
                  toast.error(parsedNota.message);
                  return;
                }

                onSubmit(
                  {
                    TRIMESTRE: effectiveTrimestre,
                    ID_CURSO: idCurso,
                    ID_ALUMNO: student.idAlumno,
                    ID_ESPECIALIDAD: student.idEspecialidad,
                    NOTA_MEDIA: parsedNota.value,
                    COMENTARIOS: comentarios.trim() || null,
                    ID_RUBRICA: usesRubric ? rubricaId : null,
                    RESULTADOS_RUBRICA: usesRubric ? resultadosRubrica : null,
                  },
                  existing?.ID_EVALUACION,
                );
              }}
            >
              {submitting ? "Guardando..." : existing ? "Actualizar" : "Guardar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IndividualRubricAssignmentPanel({
  trimestre,
  onTrimestreChange,
  students,
  batches,
  onBatchesChange,
  activeRubricas,
  evaluationIndex,
  profesorId,
  readOnly,
}: {
  trimestre: string;
  onTrimestreChange: (value: string) => void;
  students: TeacherHorarioStudent[];
  batches: IndividualRubricBatch[];
  onBatchesChange: (next: IndividualRubricBatch[]) => void;
  activeRubricas: RubricaData[];
  evaluationIndex: Map<string, EvaluacionData>;
  profesorId: string;
  readOnly?: boolean;
}) {
  const [draftRubricaId, setDraftRubricaId] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const assignedKeys = useMemo(
    () => new Set(batches.flatMap((batch) => batch.studentKeys)),
    [batches],
  );

  const unassignedStudents = useMemo(
    () =>
      students
        .filter((student) => !assignedKeys.has(studentKey(student)))
        .sort((a, b) =>
          a.nombreAlumno.localeCompare(b.nombreAlumno, "es", { sensitivity: "base" }),
        ),
    [students, assignedKeys],
  );

  const studentByKey = useMemo(
    () => new Map(students.map((student) => [studentKey(student), student])),
    [students],
  );

  const toggleStudent = (key: string, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleAssign = () => {
    if (readOnly) {
      toast.error("Este curso está cerrado. Solo puedes consultar las evaluaciones.");
      return;
    }
    if (selectedKeys.size === 0) {
      toast.error("Selecciona al menos un alumno");
      return;
    }
    onBatchesChange(assignStudentsToRubric(batches, draftRubricaId, [...selectedKeys]));
    setSelectedKeys(new Set());
    toast.success("Alumnos asignados a la rúbrica");
  };

  const handleRemoveStudent = (key: string) => {
    if (readOnly) return;
    onBatchesChange(removeStudentFromBatches(batches, key));
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Trimestre *</Label>
          <Select value={trimestre} onValueChange={onTrimestreChange} disabled={readOnly}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIMESTRE_VALUES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === "FINAL" ? "Final" : `Trimestre ${t}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <RubricSelector
          label="Rúbrica para asignar"
          value={draftRubricaId}
          onChange={setDraftRubricaId}
          rubricas={activeRubricas}
          disabled={readOnly}
        />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">Alumnos sin asignar</p>
            <p className="text-sm text-muted-foreground">
              {unassignedStudents.length} pendiente(s) de rúbrica
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleAssign}
            disabled={readOnly || selectedKeys.size === 0}
          >
            Asignar seleccionados
          </Button>
        </div>

        {unassignedStudents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todos los alumnos tienen rúbrica asignada. Pasa a la pestaña &quot;2. Evaluar&quot;.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Alumno</TableHead>
                  <TableHead>Especialidad</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unassignedStudents.map((student) => {
                  const key = studentKey(student);
                  const evaluated = evaluationIndex.has(
                    evaluationLookupKey(
                      trimestre,
                      student.idAlumno,
                      student.idEspecialidad,
                      profesorId,
                    ),
                  );
                  return (
                    <TableRow key={key}>
                      <TableCell>
                        <Checkbox
                          checked={selectedKeys.has(key)}
                          onCheckedChange={(checked) => toggleStudent(key, checked === true)}
                          disabled={readOnly}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{student.nombreAlumno}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {student.nombreEspecialidad}
                      </TableCell>
                      <TableCell>
                        <EvaluationStatusBadge evaluated={evaluated} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {batches.length > 0 ? (
        <div className="space-y-3">
          <p className="font-medium">Asignaciones ({batches.length})</p>
          {batches.map((batch) => {
            const batchStudents = batch.studentKeys
              .map((key) => studentByKey.get(key))
              .filter((student): student is TeacherHorarioStudent => Boolean(student));

            return (
              <Card key={batch.id} className="p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{rubricaLabel(batch.rubricaId, activeRubricas)}</p>
                    <p className="text-sm text-muted-foreground">
                      {batchStudents.length} alumno(s)
                    </p>
                  </div>
                  <Badge variant="outline">{batchStudents.length}</Badge>
                </div>
                <ul className="space-y-2">
                  {batchStudents.map((student) => {
                    const key = studentKey(student);
                    const evaluated = evaluationIndex.has(
                      evaluationLookupKey(
                        trimestre,
                        student.idAlumno,
                        student.idEspecialidad,
                        profesorId,
                      ),
                    );
                    return (
                      <li
                        key={key}
                        className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{student.nombreAlumno}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {student.nombreEspecialidad}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <EvaluationStatusBadge evaluated={evaluated} />
                          {!readOnly && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleRemoveStudent(key)}
                              aria-label={`Quitar ${student.nombreAlumno}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Selecciona alumnos y asígnalos a una rúbrica para poder evaluarlos en la siguiente
          pestaña.
        </Card>
      )}
    </div>
  );
}

function buildGroupRowDraft(
  student: TeacherHorarioStudent,
  existing: EvaluacionData | undefined,
  criteria: RubricCriterion[],
): GroupRowDraft {
  return {
    idAlumno: student.idAlumno,
    idEspecialidad: student.idEspecialidad,
    nombreAlumno: student.nombreAlumno,
    nombreEspecialidad: student.nombreEspecialidad,
    notaMedia: formatNotaMediaInput(existing?.NOTA_MEDIA),
    comentarios: existing?.COMENTARIOS ?? "",
    criterios: initCriterioGradeValues(criteria, existing?.RESULTADOS_RUBRICA),
    existingId: existing?.ID_EVALUACION,
  };
}

function GroupBulkEvaluationPanel({
  group,
  trimestre,
  idCurso,
  profesorId,
  evaluationIndex,
  activeRubricas,
  submitting,
  onSave,
  onSelectStudent,
  readOnly,
  fixedRubricaId,
  hideRubricSelector,
  hideMobileCards,
}: {
  group: TeacherHorarioGroup;
  trimestre: string;
  idCurso: string;
  profesorId: string;
  evaluationIndex: Map<string, EvaluacionData>;
  activeRubricas: RubricaData[];
  submitting: boolean;
  onSave: (items: EvaluacionUpsertItem[]) => Promise<void>;
  onSelectStudent?: (student: TeacherHorarioStudent, rubricaId: string) => void;
  readOnly?: boolean;
  fixedRubricaId?: string;
  hideRubricSelector?: boolean;
  hideMobileCards?: boolean;
}) {
  const [rubricaId, setRubricaId] = useState(fixedRubricaId ?? "");
  const [rows, setRows] = useState<GroupRowDraft[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const effectiveRubricaId = fixedRubricaId ?? rubricaId;

  useEffect(() => {
    if (fixedRubricaId !== undefined) {
      setRubricaId(fixedRubricaId);
    }
  }, [fixedRubricaId]);

  const selectedRubrica = useMemo(
    () => activeRubricas.find((r) => r.ID_RUBRICA === effectiveRubricaId) ?? null,
    [activeRubricas, effectiveRubricaId],
  );

  const criteria = useMemo(
    () => parseRubricCriteria(selectedRubrica?.ESTRUCTURA),
    [selectedRubrica],
  );

  const usesRubric = criteria.length > 0;
  const cellsPerRow = usesRubric ? criteria.length + 2 : 2;

  useEffect(() => {
    setRows(
      group.students.map((student) => {
        const existing = evaluationIndex.get(
          evaluationLookupKey(trimestre, student.idAlumno, student.idEspecialidad, profesorId),
        );
        return buildGroupRowDraft(student, existing, criteria);
      }),
    );
  }, [group, trimestre, evaluationIndex, criteria, profesorId]);

  const updateRow = (index: number, patch: Partial<GroupRowDraft>) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        if (usesRubric && patch.criterios) {
          const auto = computeAutoNotaMediaFromCriteria(next.criterios);
          if (auto != null) next.notaMedia = auto;
        }
        return next;
      }),
    );
  };

  const updateCriterio = (rowIndex: number, key: string, value: string) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== rowIndex) return row;
        const criterios = { ...row.criterios, [key]: value };
        const auto = computeAutoNotaMediaFromCriteria(criterios);
        return {
          ...row,
          criterios,
          notaMedia: auto != null ? auto : row.notaMedia,
        };
      }),
    );
  };

  const handleSave = async () => {
    if (readOnly) {
      toast.error("Este curso está cerrado. Solo puedes consultar las evaluaciones.");
      return;
    }
    if (!isTrimestreValue(trimestre)) {
      toast.error("Selecciona un trimestre válido");
      return;
    }

    const items: EvaluacionUpsertItem[] = [];

    for (const row of rows) {
      const notaRaw = row.notaMedia.trim();
      const hasNota = notaRaw !== "";
      const hasComentarios = row.comentarios.trim() !== "";
      const hasCriterios = Object.values(row.criterios).some((v) => v.trim() !== "");

      if (!hasNota && !row.existingId && !hasCriterios) continue;
      if (!hasNota && row.existingId && !hasComentarios && !hasCriterios) continue;

      let resultadosRubrica: Record<string, string | number> | null = null;
      if (usesRubric && criteria.length > 0) {
        resultadosRubrica = buildResultadosRubricaByLabel(criteria, row.criterios);
      }

      let nota: number | string = 0;
      if (hasNota) {
        const parsedNota = parseNotaMediaForSave(notaRaw, row.nombreAlumno);
        if (!parsedNota.ok) {
          toast.error(parsedNota.message);
          return;
        }
        nota = parsedNota.value;
      } else if (row.existingId) {
        const existing = evaluationIndex.get(
          evaluationLookupKey(trimestre, row.idAlumno, row.idEspecialidad, profesorId),
        );
        const existingNota = existing?.NOTA_MEDIA;
        nota =
          typeof existingNota === "number"
            ? existingNota
            : typeof existingNota === "string" && Number.isFinite(Number(existingNota))
              ? Number(existingNota)
              : typeof existingNota === "string"
                ? existingNota
                : 0;
      }

      items.push({
        id: row.existingId,
        input: {
          TRIMESTRE: trimestre,
          ID_CURSO: idCurso,
          ID_ALUMNO: row.idAlumno,
          ID_ESPECIALIDAD: row.idEspecialidad,
          NOTA_MEDIA: nota,
          COMENTARIOS: row.comentarios.trim() || null,
          ID_RUBRICA: usesRubric ? effectiveRubricaId : null,
          RESULTADOS_RUBRICA: usesRubric ? resultadosRubrica : null,
        },
      });
    }

    if (items.length === 0) {
      toast.error("No hay filas con datos para guardar");
      return;
    }

    await onSave(items);
  };

  const focusCell = useCallback((index: number) => {
    inputRefs.current[index]?.focus();
    inputRefs.current[index]?.select();
  }, []);

  return (
    <div className="space-y-4 pt-2">
      {!hideRubricSelector && fixedRubricaId === undefined ? (
        <RubricSelector
          label="Rúbrica a utilizar (grupo)"
          value={rubricaId}
          onChange={setRubricaId}
          rubricas={activeRubricas}
          disabled={submitting || readOnly}
        />
      ) : null}

      {!hideMobileCards && onSelectStudent ? (
        <div className="grid gap-3 lg:hidden">
          {group.students.map((student) => {
            const evaluated = evaluationIndex.has(
              evaluationLookupKey(trimestre, student.idAlumno, student.idEspecialidad, profesorId),
            );
            return (
              <StudentEvalCard
                key={`${student.idAlumno}-${student.idEspecialidad}`}
                student={student}
                evaluated={evaluated}
                onSelect={() => onSelectStudent(student, effectiveRubricaId)}
              />
            );
          })}
        </div>
      ) : null}

      <div className="hidden overflow-x-auto rounded-md border lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alumno</TableHead>
              <TableHead>Especialidad</TableHead>
              <TableHead>Estado</TableHead>
              {usesRubric &&
                criteria.map((criterion) => (
                  <TableHead key={criterion.key} className="min-w-[100px]">
                    {criterion.label}
                  </TableHead>
                ))}
              <TableHead className="w-[120px]">Nota final</TableHead>
              <TableHead className="min-w-[200px]">Comentarios</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => {
              const evaluated = !!evaluationIndex.get(
                evaluationLookupKey(trimestre, row.idAlumno, row.idEspecialidad, profesorId),
              );

              const notaCol = usesRubric ? criteria.length : 0;
              const comentariosCol = notaCol + 1;
              const baseIndex = rowIndex * cellsPerRow;

              return (
                <TableRow key={`${row.idAlumno}-${row.idEspecialidad}`}>
                  <TableCell className="font-medium">{row.nombreAlumno}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.nombreEspecialidad}
                  </TableCell>
                  <TableCell>
                    <EvaluationStatusBadge evaluated={evaluated} />
                  </TableCell>

                  {usesRubric &&
                    criteria.map((criterion, criterionIndex) => {
                      const cellIndex = criterionIndex;
                      const nextCell =
                        criterionIndex < criteria.length - 1 ? cellIndex + 1 : notaCol;
                      return (
                        <TableCell key={criterion.key}>
                          <input
                            ref={(el) => {
                              inputRefs.current[baseIndex + cellIndex] = el;
                            }}
                            type="text"
                            tabIndex={baseIndex + cellIndex + 1}
                            value={row.criterios[criterion.key] ?? ""}
                            onChange={(e) =>
                              updateCriterio(rowIndex, criterion.key, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Tab" && !e.shiftKey) {
                                e.preventDefault();
                                focusCell(baseIndex + nextCell);
                              }
                            }}
                            className={inlineInputClass}
                            placeholder="Nota, letra o texto"
                            disabled={submitting || readOnly}
                          />
                        </TableCell>
                      );
                    })}

                  <TableCell>
                    <input
                      ref={(el) => {
                        inputRefs.current[baseIndex + notaCol] = el;
                      }}
                      type="text"
                      tabIndex={baseIndex + notaCol + 1}
                      value={row.notaMedia}
                      onChange={(e) => updateRow(rowIndex, { notaMedia: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Tab" && !e.shiftKey) {
                          e.preventDefault();
                          focusCell(baseIndex + comentariosCol);
                        }
                      }}
                      className={inlineInputClass}
                      placeholder="Ej. 8.50, A"
                      disabled={submitting || readOnly}
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      ref={(el) => {
                        inputRefs.current[baseIndex + comentariosCol] = el;
                      }}
                      type="text"
                      tabIndex={baseIndex + comentariosCol + 1}
                      value={row.comentarios}
                      onChange={(e) => updateRow(rowIndex, { comentarios: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Tab" && !e.shiftKey && rowIndex < rows.length - 1) {
                          e.preventDefault();
                          focusCell((rowIndex + 1) * cellsPerRow);
                        }
                      }}
                      className={inlineInputClass}
                      placeholder="Comentarios..."
                      disabled={submitting || readOnly}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="hidden justify-end lg:flex">
        <Button type="button" onClick={handleSave} disabled={submitting || readOnly}>
          {submitting ? "Guardando..." : "Guardar grupo"}
        </Button>
      </div>
    </div>
  );
}

export function TeacherEvaluationsDashboard({
  profesorId,
}: {
  profesorId: string | null | undefined;
}) {
  const { tenantId, rol } = useActiveTenant();
  const [idCurso, setIdCurso] = useState("");
  const [trimestre, setTrimestre] = useState<string>("1");
  const [evalTarget, setEvalTarget] = useState<{
    student: TeacherHorarioStudent;
    lockedRubricaId?: string;
    lockTrimestre?: boolean;
  } | null>(null);
  const [individualBatches, setIndividualBatches] = useState<IndividualRubricBatch[]>([]);
  const [individualBatchSeedKey, setIndividualBatchSeedKey] = useState("");

  const cursosList = useQuery({
    queryKey: [...tenantListKey("teacherEvalCursos", rol, tenantId), profesorId ?? "none"],
    enabled: !!profesorId,
    queryFn: async (): Promise<TeacherCursoOption[]> => {
      let horariosQuery = supabase
        .from("HORARIOS_MATRICULAS")
        .select("ID_CURSO")
        .eq("ID_PROFESOR", profesorId!);
      horariosQuery = scopeTenantQuery(horariosQuery, rol, tenantId);
      const { data: horarioRows, error: horariosError } = await horariosQuery;
      if (horariosError) throw horariosError;

      const cursoIds = Array.from(
        new Set(
          (horarioRows ?? [])
            .map((row) => row.ID_CURSO?.trim())
            .filter((id): id is string => Boolean(id)),
        ),
      );
      if (cursoIds.length === 0) return [];

      let cursosQuery = supabase
        .from("CURSO_ESCOLAR")
        .select("ID_CURSO, NOMBRE_CURSO, ESTADO, FECHA_INICIO, FECHA_FIN")
        .in("ID_CURSO", cursoIds);
      cursosQuery = scopeTenantQuery(cursosQuery, rol, tenantId);
      const { data: cursos, error: cursosError } = await cursosQuery;
      if (cursosError) throw cursosError;

      const byId = new Map((cursos ?? []).map((c) => [c.ID_CURSO, c]));
      return cursoIds
        .map((id) => {
          const row = byId.get(id);
          return {
            ID_CURSO: id,
            NOMBRE_CURSO: row?.NOMBRE_CURSO?.trim() || id,
            ESTADO: row?.ESTADO ?? null,
            FECHA_INICIO: row?.FECHA_INICIO ?? null,
            FECHA_FIN: row?.FECHA_FIN ?? null,
          };
        })
        .sort((a, b) => (b.FECHA_INICIO ?? "").localeCompare(a.FECHA_INICIO ?? ""));
    },
  });

  const cursos = cursosList.data ?? [];
  const selectedCurso = cursos.find((c) => c.ID_CURSO === idCurso);
  const canWriteCurso = isCursoVigente(selectedCurso);

  useEffect(() => {
    const items = cursosList.data ?? [];
    if (items.length === 0) {
      if (idCurso) setIdCurso("");
      return;
    }
    if (items.some((c) => c.ID_CURSO === idCurso)) return;
    setIdCurso(pickDefaultCursoId(items));
  }, [cursosList.data, idCurso]);

  const { list: horariosList } = useTeacherHorarios(profesorId, {
    idCurso,
    soloActivos: true,
  });
  const {
    list: evaluacionesList,
    create,
    update,
    batchUpsert,
  } = useEvaluaciones(undefined, undefined, profesorId);
  const { list: rubricasList } = useRubricas();
  const { list: especialidadesList } = useEspecialidades();
  const { list: gruposList } = useGrupos();

  const especialidades = useMemo(() => especialidadesList.data ?? [], [especialidadesList.data]);
  const grupos = useMemo(() => gruposList.data?.grupos ?? [], [gruposList.data?.grupos]);
  const evaluaciones = useMemo(() => evaluacionesList.data ?? [], [evaluacionesList.data]);
  const activeRubricas = useMemo(
    () => filterActiveRubricas(rubricasList.data ?? []),
    [rubricasList.data],
  );

  const especialidadById = useMemo(
    () => new Map(especialidades.map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD])),
    [especialidades],
  );
  const grupoById = useMemo(
    () =>
      new Map(
        grupos.map((g) => [
          g.ID_GRUPO,
          {
            nombreGrupo: g.NOMBRE_GRUPO,
            nombreEspecialidad: g.TEXTO_ESPECIALIDAD || g.NOMBRE_GRUPO,
          },
        ]),
      ),
    [grupos],
  );

  const horariosActivos = useMemo(
    () => (horariosList.data ?? []).filter(isHorarioActivo),
    [horariosList.data],
  );

  const alumnoIds = useMemo(
    () => Array.from(new Set(horariosActivos.map((row) => row.ID_ALUMNO).filter(Boolean))),
    [horariosActivos],
  );

  const alumnosNombresList = useQuery({
    queryKey: [
      ...tenantListKey("teacherEvalAlumnos", rol, tenantId),
      profesorId ?? "none",
      alumnoIds,
    ],
    enabled: alumnoIds.length > 0,
    queryFn: async () => {
      let query = supabase.from("ALUMNOS").select("ID_ALUMNO, NOMBRE_ALUMNO");
      query = scopeTenantQuery(query, rol, tenantId);
      query = query.in("ID_ALUMNO", alumnoIds);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as { ID_ALUMNO: string; NOMBRE_ALUMNO: string }[];
    },
  });

  const alumnoById = useMemo(
    () => new Map((alumnosNombresList.data ?? []).map((a) => [a.ID_ALUMNO, a.NOMBRE_ALUMNO])),
    [alumnosNombresList.data],
  );

  const roster = useMemo(
    () => buildTeacherRoster(horariosActivos, alumnoById, especialidadById, grupoById),
    [horariosActivos, alumnoById, especialidadById, grupoById],
  );

  const evaluationIndex = useMemo(
    () => buildEvaluationIndex(evaluaciones, idCurso, profesorId),
    [evaluaciones, idCurso, profesorId],
  );

  const individualStudentByKey = useMemo(
    () => new Map(roster.individuales.map((student) => [studentKey(student), student])),
    [roster.individuales],
  );

  const individualSyntheticGroups = useMemo(
    () =>
      individualBatches.map((batch) =>
        batchToSyntheticGroup(batch, individualStudentByKey, activeRubricas),
      ),
    [individualBatches, individualStudentByKey, activeRubricas],
  );

  useEffect(() => {
    if (!profesorId) {
      setIndividualBatches([]);
      setIndividualBatchSeedKey("");
      return;
    }

    const nextSeedKey = [
      idCurso,
      trimestre,
      roster.individuales
        .map((student) => studentKey(student))
        .sort()
        .join("|"),
    ].join("::");

    if (nextSeedKey === individualBatchSeedKey) return;

    setIndividualBatches(
      seedIndividualBatches(
        roster.individuales,
        trimestre,
        evaluationIndex,
        profesorId,
        activeRubricas,
      ),
    );
    setIndividualBatchSeedKey(nextSeedKey);
  }, [
    roster.individuales,
    trimestre,
    evaluationIndex,
    profesorId,
    activeRubricas,
    idCurso,
    individualBatchSeedKey,
  ]);

  const isLoading =
    cursosList.isLoading ||
    horariosList.isLoading ||
    (alumnoIds.length > 0 && alumnosNombresList.isLoading) ||
    evaluacionesList.isLoading ||
    rubricasList.isLoading ||
    especialidadesList.isLoading;

  const submitting = create.isPending || update.isPending || batchUpsert.isPending;

  const handleIndividualSave = async (payload: EvaluacionCreateInput, existingId?: string) => {
    if (!canWriteCurso) {
      toast.error("Este curso está cerrado. Solo puedes consultar las evaluaciones.");
      return;
    }
    const payloadWithProfesor = { ...payload, ID_PROFESOR: profesorId };
    try {
      if (existingId) {
        await update.mutateAsync({ id: existingId, patch: payloadWithProfesor });
        toast.success("Evaluación actualizada");
      } else {
        await create.mutateAsync(payloadWithProfesor);
        toast.success("Evaluación registrada");
      }
      setEvalTarget(null);
    } catch (err) {
      console.error("TEACHER INDIVIDUAL EVAL ERROR:", err);
      showEvaluacionSaveError(err);
    }
  };

  const handleGroupSave = async (items: EvaluacionUpsertItem[]) => {
    if (!canWriteCurso) {
      toast.error("Este curso está cerrado. Solo puedes consultar las evaluaciones.");
      return;
    }
    try {
      await batchUpsert.mutateAsync(
        items.map((item) => ({
          ...item,
          input: { ...item.input, ID_PROFESOR: profesorId },
        })),
      );
      toast.success(`${items.length} evaluación(es) guardada(s)`);
    } catch (err) {
      console.error("TEACHER GROUP BATCH ERROR:", err);
      showEvaluacionSaveError(err);
    }
  };

  if (!profesorId) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Tu perfil no tiene un profesor vinculado. Contacta con administración.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2 sm:w-[220px]">
            <Label>Año académico</Label>
            <Select value={idCurso} onValueChange={setIdCurso} disabled={cursos.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un curso" />
              </SelectTrigger>
              <SelectContent>
                {cursos.map((curso) => (
                  <SelectItem key={curso.ID_CURSO} value={curso.ID_CURSO}>
                    {isCursoVigente(curso) ? curso.NOMBRE_CURSO : `${curso.NOMBRE_CURSO} (cerrado)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:w-[200px]">
            <Label>Trimestre</Label>
            <Select value={trimestre} onValueChange={setTrimestre}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIMESTRE_VALUES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t === "FINAL" ? "Final" : `Trimestre ${t}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {selectedCurso && !canWriteCurso && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Este curso no está vigente. Puedes consultar las evaluaciones, pero no crear ni editar.
        </div>
      )}

      {cursosList.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar cursos: {(cursosList.error as Error)?.message}
        </div>
      )}

      {horariosList.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar horarios: {(horariosList.error as Error)?.message}
        </div>
      )}

      {alumnosNombresList.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar alumnos: {(alumnosNombresList.error as Error)?.message}
        </div>
      )}

      {rubricasList.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar rúbricas: {(rubricasList.error as Error)?.message}
        </div>
      )}

      <Tabs defaultValue="individuales">
        <TabsList className="flex h-auto w-full flex-wrap max-[349px]:flex-col max-[349px]:gap-1">
          <TabsTrigger
            value="individuales"
            className="min-w-0 flex-1 basis-0 gap-2 whitespace-normal px-2 py-2 text-center leading-tight sm:px-3 max-[349px]:w-full max-[349px]:flex-none max-[349px]:items-center max-[349px]:justify-between max-[349px]:text-left"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <User className="h-4 w-4 shrink-0" />
              <span>Clases individuales</span>
            </span>
            <Badge variant="secondary" className="shrink-0">
              {roster.individuales.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="grupos"
            className="min-w-0 flex-1 basis-0 gap-2 whitespace-normal px-2 py-2 text-center leading-tight sm:px-3 max-[349px]:w-full max-[349px]:flex-none max-[349px]:items-center max-[349px]:justify-between max-[349px]:text-left"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Users className="h-4 w-4 shrink-0" />
              <span>Grupos</span>
            </span>
            <Badge variant="secondary" className="shrink-0">
              {roster.grupos.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="individuales" className="mt-4">
          {isLoading ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
              <div className="hidden space-y-3 lg:block">
                <Skeleton className="h-10 w-full max-w-md" />
                <Skeleton className="h-64 w-full" />
              </div>
            </>
          ) : roster.individuales.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              No tienes clases individuales asignadas en tu horario.
            </Card>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
                {roster.individuales.map((student) => {
                  const evaluated = !!evaluationIndex.get(
                    evaluationLookupKey(
                      trimestre,
                      student.idAlumno,
                      student.idEspecialidad,
                      profesorId,
                    ),
                  );
                  return (
                    <StudentEvalCard
                      key={`${student.idAlumno}-${student.idEspecialidad}`}
                      student={student}
                      evaluated={evaluated}
                      onSelect={() => setEvalTarget({ student, lockTrimestre: true })}
                    />
                  );
                })}
              </div>

              <div className="hidden lg:block">
                <Tabs defaultValue="asignar">
                  <TabsList>
                    <TabsTrigger value="asignar">1. Rúbricas</TabsTrigger>
                    <TabsTrigger value="evaluar">2. Evaluar</TabsTrigger>
                  </TabsList>

                  <TabsContent value="asignar" className="mt-4">
                    <IndividualRubricAssignmentPanel
                      trimestre={trimestre}
                      onTrimestreChange={setTrimestre}
                      students={roster.individuales}
                      batches={individualBatches}
                      onBatchesChange={setIndividualBatches}
                      activeRubricas={activeRubricas}
                      evaluationIndex={evaluationIndex}
                      profesorId={profesorId}
                      readOnly={!canWriteCurso}
                    />
                  </TabsContent>

                  <TabsContent value="evaluar" className="mt-4">
                    {individualSyntheticGroups.length === 0 ? (
                      <Card className="p-10 text-center text-muted-foreground">
                        Asigna alumnos a rúbricas en la pestaña &quot;1. Rúbricas&quot; para
                        evaluarlos aquí.
                      </Card>
                    ) : (
                      <Accordion type="single" collapsible className="rounded-md border px-4">
                        {individualSyntheticGroups.map((group) => {
                          const batch = individualBatches.find((item) => item.id === group.idGrupo);
                          const evaluatedCount = group.students.filter((s) =>
                            evaluationIndex.has(
                              evaluationLookupKey(
                                trimestre,
                                s.idAlumno,
                                s.idEspecialidad,
                                profesorId,
                              ),
                            ),
                          ).length;

                          return (
                            <AccordionItem key={group.idGrupo} value={group.idGrupo}>
                              <AccordionTrigger className="hover:no-underline">
                                <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2 pr-2 text-left">
                                  <div className="min-w-0 flex-1">
                                    <p className="break-words font-medium leading-snug">
                                      {group.label}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {group.students.length} alumno(s)
                                    </p>
                                  </div>
                                  <Badge variant="outline" className="shrink-0">
                                    {evaluatedCount}/{group.students.length} evaluados
                                  </Badge>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent>
                                <GroupBulkEvaluationPanel
                                  group={group}
                                  trimestre={trimestre}
                                  idCurso={idCurso}
                                  profesorId={profesorId}
                                  evaluationIndex={evaluationIndex}
                                  activeRubricas={activeRubricas}
                                  submitting={submitting}
                                  onSave={handleGroupSave}
                                  readOnly={!canWriteCurso}
                                  fixedRubricaId={batch?.rubricaId}
                                  hideRubricSelector
                                  hideMobileCards
                                />
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="grupos" className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : roster.grupos.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              No tienes grupos asignados en tu horario.
            </Card>
          ) : (
            <Accordion type="single" collapsible className="rounded-md border px-4">
              {roster.grupos.map((group) => {
                const evaluatedCount = group.students.filter((s) =>
                  evaluationIndex.has(
                    evaluationLookupKey(trimestre, s.idAlumno, s.idEspecialidad, profesorId),
                  ),
                ).length;

                return (
                  <AccordionItem key={group.idGrupo} value={group.idGrupo}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2 pr-2 text-left max-[349px]:flex-col max-[349px]:gap-1.5">
                        <div className="min-w-0 flex-1 max-[349px]:w-full">
                          <p className="break-words font-medium leading-snug">{group.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {group.students.length} alumno(s)
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {evaluatedCount}/{group.students.length} evaluados
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <GroupBulkEvaluationPanel
                        group={group}
                        trimestre={trimestre}
                        idCurso={idCurso}
                        profesorId={profesorId}
                        evaluationIndex={evaluationIndex}
                        activeRubricas={activeRubricas}
                        submitting={submitting}
                        onSave={handleGroupSave}
                        readOnly={!canWriteCurso}
                        onSelectStudent={(student, groupRubricaId) =>
                          setEvalTarget({
                            student,
                            lockedRubricaId: groupRubricaId,
                            lockTrimestre: true,
                          })
                        }
                      />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </TabsContent>
      </Tabs>

      {evalTarget && (
        <TeacherIndividualEvalDialog
          student={evalTarget.student}
          trimestre={trimestre}
          idCurso={idCurso}
          profesorId={profesorId}
          evaluationIndex={evaluationIndex}
          activeRubricas={activeRubricas}
          open
          onClose={() => setEvalTarget(null)}
          submitting={submitting}
          onSubmit={handleIndividualSave}
          lockedRubricaId={evalTarget.lockedRubricaId}
          lockTrimestre={evalTarget.lockTrimestre}
          readOnly={!canWriteCurso}
        />
      )}
    </div>
  );
}
