import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Users,
  User,
} from "lucide-react";
import {
  useEvaluaciones,
  formatSupabaseError,
  isTrimestreValue,
  TRIMESTRE_VALUES,
  currentAcademicYear,
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
  type TeacherHorarioStudent,
} from "@/hooks/useTeacherHorarios";
import { useRubricas, filterActiveRubricas, type RubricaData } from "@/hooks/useRubricas";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { useGrupos } from "@/hooks/useGrupos";
import {
  buildResultadosRubrica,
  computeNotaMediaFromCriteria,
  parseResultadosRubrica,
  parseRubricCriteria,
  type RubricCriterion,
} from "@/lib/rubricStructure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";

const RUBRICA_NONE_VALUE = "__none__";

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

const inlineInputClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function EvaluationStatusBadge({ evaluated }: { evaluated: boolean }) {
  if (evaluated) {
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        Evaluado
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 text-amber-800 bg-amber-50 border-amber-200">
      <Clock className="h-3 w-3" />
      Pendiente
    </Badge>
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

function initCriterioValues(
  criteria: RubricCriterion[],
  existing: EvaluacionData | null | undefined,
): Record<string, string> {
  const saved = parseResultadosRubrica(existing?.RESULTADOS_RUBRICA);
  const values: Record<string, string> = {};
  for (const criterion of criteria) {
    values[criterion.key] = saved[criterion.key] ?? "";
  }
  return values;
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

function TeacherIndividualEvalDialog({
  student,
  trimestre,
  ano,
  evaluationIndex,
  activeRubricas,
  open,
  onClose,
  submitting,
  onSubmit,
}: {
  student: TeacherHorarioStudent;
  trimestre: string;
  ano: string;
  evaluationIndex: Map<string, EvaluacionData>;
  activeRubricas: RubricaData[];
  open: boolean;
  onClose: () => void;
  submitting: boolean;
  onSubmit: (payload: EvaluacionCreateInput, existingId?: string) => void;
}) {
  const [localTrimestre, setLocalTrimestre] = useState(trimestre);
  const [rubricaId, setRubricaId] = useState("");
  const [notaMedia, setNotaMedia] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [criterioValues, setCriterioValues] = useState<Record<string, string>>({});

  const existing = useMemo(
    () =>
      evaluationIndex.get(
        evaluationLookupKey(localTrimestre, student.idAlumno, student.idEspecialidad),
      ) ?? null,
    [evaluationIndex, localTrimestre, student.idAlumno, student.idEspecialidad],
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
    setRubricaId(resolveInitialRubricaId(existing, activeRubricas));
    setComentarios(existing?.COMENTARIOS ?? "");
    setNotaMedia(
      existing?.NOTA_MEDIA != null && !Number.isNaN(existing.NOTA_MEDIA)
        ? String(existing.NOTA_MEDIA)
        : "",
    );
  }, [open, existing, activeRubricas]);

  useEffect(() => {
    if (!open) return;
    setCriterioValues(initCriterioValues(criteria, existing));
  }, [open, criteria, existing]);

  useEffect(() => {
    if (!usesRubric) return;
    const auto = computeNotaMediaFromCriteria(criterioValues);
    if (auto != null) {
      setNotaMedia(String(auto));
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
            Evaluar alumno
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

          <div className="space-y-2">
            <Label>Trimestre *</Label>
            <Select
              value={localTrimestre}
              onValueChange={setLocalTrimestre}
              disabled={submitting}
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

          <RubricSelector
            label="Rúbrica a utilizar"
            value={rubricaId}
            onChange={setRubricaId}
            rubricas={activeRubricas}
            disabled={submitting}
          />

          {usesRubric ? (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Criterios de la rúbrica</p>
              {criteria.map((criterion) => (
                <div key={criterion.key} className="space-y-1">
                  <Label>{criterion.label}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step={0.01}
                    value={criterioValues[criterion.key] ?? ""}
                    onChange={(e) => updateCriterio(criterion.key, e.target.value)}
                    placeholder="0 – 10"
                    disabled={submitting}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Nota media *</Label>
            <Input
              type="number"
              min={0}
              max={10}
              step={0.01}
              value={notaMedia}
              onChange={(e) => setNotaMedia(e.target.value)}
              placeholder="0.00 – 10.00"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Comentarios</Label>
            <Textarea
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              rows={4}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={submitting || !notaMedia.trim()}
            onClick={() => {
              if (!isTrimestreValue(localTrimestre)) {
                toast.error("Selecciona un trimestre válido");
                return;
              }

              let resultadosRubrica: Record<string, number> | null = null;
              try {
                if (usesRubric) {
                  resultadosRubrica = buildResultadosRubrica(criteria, criterioValues);
                  if (!resultadosRubrica) {
                    toast.error("Introduce al menos una puntuación de criterio");
                    return;
                  }
                }
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Error en la rúbrica");
                return;
              }

              const nota = parseFloat(notaMedia);
              if (!Number.isFinite(nota) || nota < 0 || nota > 10) {
                toast.error("La nota debe estar entre 0 y 10");
                return;
              }

              onSubmit(
                {
                  ANO: ano,
                  TRIMESTRE: localTrimestre,
                  CURSO: "Individual",
                  ID_ALUMNO: student.idAlumno,
                  ID_ESPECIALIDAD: student.idEspecialidad,
                  NOTA_MEDIA: nota,
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    notaMedia:
      existing?.NOTA_MEDIA != null && !Number.isNaN(existing.NOTA_MEDIA)
        ? String(existing.NOTA_MEDIA)
        : "",
    comentarios: existing?.COMENTARIOS ?? "",
    criterios: initCriterioValues(criteria, existing),
    existingId: existing?.ID_EVALUACION,
  };
}

function GroupBulkEvaluationPanel({
  group,
  trimestre,
  ano,
  evaluationIndex,
  activeRubricas,
  submitting,
  onSave,
}: {
  group: TeacherHorarioGroup;
  trimestre: string;
  ano: string;
  evaluationIndex: Map<string, EvaluacionData>;
  activeRubricas: RubricaData[];
  submitting: boolean;
  onSave: (items: EvaluacionUpsertItem[]) => Promise<void>;
}) {
  const [rubricaId, setRubricaId] = useState("");
  const [rows, setRows] = useState<GroupRowDraft[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const selectedRubrica = useMemo(
    () => activeRubricas.find((r) => r.ID_RUBRICA === rubricaId) ?? null,
    [activeRubricas, rubricaId],
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
          evaluationLookupKey(trimestre, student.idAlumno, student.idEspecialidad),
        );
        return buildGroupRowDraft(student, existing, criteria);
      }),
    );
  }, [group, trimestre, evaluationIndex, criteria]);

  const updateRow = (index: number, patch: Partial<GroupRowDraft>) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        if (usesRubric && patch.criterios) {
          const auto = computeNotaMediaFromCriteria(next.criterios);
          if (auto != null) next.notaMedia = String(auto);
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
        const auto = computeNotaMediaFromCriteria(criterios);
        return {
          ...row,
          criterios,
          notaMedia: auto != null ? String(auto) : row.notaMedia,
        };
      }),
    );
  };

  const handleSave = async () => {
    if (!isTrimestreValue(trimestre)) {
      toast.error("Selecciona un trimestre válido");
      return;
    }

    const items: EvaluacionUpsertItem[] = [];
    const curso = group.nombreGrupo || "Grupo";

    for (const row of rows) {
      const notaRaw = row.notaMedia.trim();
      const hasNota = notaRaw !== "";
      const hasComentarios = row.comentarios.trim() !== "";
      const hasCriterios = Object.values(row.criterios).some((v) => v.trim() !== "");

      if (!hasNota && !row.existingId && !hasCriterios) continue;
      if (!hasNota && row.existingId && !hasComentarios && !hasCriterios) continue;

      let resultadosRubrica: Record<string, number> | null = null;
      if (usesRubric && hasCriterios) {
        try {
          resultadosRubrica = buildResultadosRubrica(criteria, row.criterios);
        } catch (err) {
          toast.error(
            err instanceof Error
              ? `${row.nombreAlumno}: ${err.message}`
              : `Error en rúbrica de ${row.nombreAlumno}`,
          );
          return;
        }
      }

      let nota = 0;
      if (hasNota) {
        nota = parseFloat(notaRaw);
        if (!Number.isFinite(nota) || nota < 0 || nota > 10) {
          toast.error(`Nota inválida para ${row.nombreAlumno}`);
          return;
        }
      } else if (resultadosRubrica) {
        const values = Object.fromEntries(
          Object.entries(resultadosRubrica).map(([k, v]) => [k, String(v)]),
        );
        nota = computeNotaMediaFromCriteria(values) ?? 0;
      } else if (row.existingId) {
        const existing = evaluationIndex.get(
          evaluationLookupKey(trimestre, row.idAlumno, row.idEspecialidad),
        );
        nota = existing?.NOTA_MEDIA ?? 0;
      }

      items.push({
        id: row.existingId,
        input: {
          ANO: ano,
          TRIMESTRE: trimestre,
          CURSO: curso,
          ID_ALUMNO: row.idAlumno,
          ID_ESPECIALIDAD: row.idEspecialidad,
          NOTA_MEDIA: nota,
          COMENTARIOS: row.comentarios.trim() || null,
          ID_RUBRICA: usesRubric ? rubricaId : null,
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
      <RubricSelector
        label="Rúbrica a utilizar (grupo)"
        value={rubricaId}
        onChange={setRubricaId}
        rubricas={activeRubricas}
        disabled={submitting}
      />

      <div className="overflow-x-auto rounded-md border">
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
              <TableHead className="w-[120px]">Nota media</TableHead>
              <TableHead className="min-w-[200px]">Comentarios</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => {
              const evaluated = !!evaluationIndex.get(
                evaluationLookupKey(trimestre, row.idAlumno, row.idEspecialidad),
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
                        criterionIndex < criteria.length - 1
                          ? cellIndex + 1
                          : notaCol;
                      return (
                        <TableCell key={criterion.key}>
                          <input
                            ref={(el) => {
                              inputRefs.current[baseIndex + cellIndex] = el;
                            }}
                            type="number"
                            min={0}
                            max={10}
                            step={0.01}
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
                            placeholder="0–10"
                            disabled={submitting}
                          />
                        </TableCell>
                      );
                    })}

                  <TableCell>
                    <input
                      ref={(el) => {
                        inputRefs.current[baseIndex + notaCol] = el;
                      }}
                      type="number"
                      min={0}
                      max={10}
                      step={0.01}
                      tabIndex={baseIndex + notaCol + 1}
                      value={row.notaMedia}
                      onChange={(e) =>
                        updateRow(rowIndex, { notaMedia: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Tab" && !e.shiftKey) {
                          e.preventDefault();
                          focusCell(baseIndex + comentariosCol);
                        }
                      }}
                      className={inlineInputClass}
                      placeholder="0–10"
                      disabled={submitting}
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
                      onChange={(e) =>
                        updateRow(rowIndex, { comentarios: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Tab" && !e.shiftKey && rowIndex < rows.length - 1) {
                          e.preventDefault();
                          focusCell((rowIndex + 1) * cellsPerRow);
                        }
                      }}
                      className={inlineInputClass}
                      placeholder="Comentarios..."
                      disabled={submitting}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={submitting}>
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
  const ano = currentAcademicYear();
  const [trimestre, setTrimestre] = useState<string>("1");
  const [selectedStudent, setSelectedStudent] = useState<TeacherHorarioStudent | null>(null);

  const { list: horariosList } = useTeacherHorarios(profesorId);
  const { list: evaluacionesList, create, update, batchUpsert } = useEvaluaciones();
  const { list: rubricasList } = useRubricas();
  const { list: alumnosList } = useAlumnos();
  const { list: especialidadesList } = useEspecialidades();
  const { list: gruposList } = useGrupos();

  const alumnos = alumnosList.data ?? [];
  const especialidades = especialidadesList.data ?? [];
  const grupos = gruposList.data?.grupos ?? [];
  const evaluaciones = evaluacionesList.data ?? [];
  const activeRubricas = useMemo(
    () => filterActiveRubricas(rubricasList.data ?? []),
    [rubricasList.data],
  );

  const alumnoById = useMemo(
    () => new Map(alumnos.map((a) => [a.ID_ALUMNO, a.NOMBRE_ALUMNO])),
    [alumnos],
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

  const roster = useMemo(() => {
    const horarios = horariosList.data ?? [];
    return buildTeacherRoster(horarios, alumnoById, especialidadById, grupoById);
  }, [horariosList.data, alumnoById, especialidadById, grupoById]);

  const evaluationIndex = useMemo(
    () => buildEvaluationIndex(evaluaciones, ano),
    [evaluaciones, ano],
  );

  const isLoading =
    horariosList.isLoading ||
    evaluacionesList.isLoading ||
    rubricasList.isLoading ||
    alumnosList.isLoading ||
    especialidadesList.isLoading;

  const submitting =
    create.isPending || update.isPending || batchUpsert.isPending;

  const handleIndividualSave = async (
    payload: EvaluacionCreateInput,
    existingId?: string,
  ) => {
    try {
      if (existingId) {
        await update.mutateAsync({ id: existingId, patch: payload });
        toast.success("Evaluación actualizada");
      } else {
        await create.mutateAsync(payload);
        toast.success("Evaluación registrada");
      }
      setSelectedStudent(null);
    } catch (err) {
      console.error("TEACHER INDIVIDUAL EVAL ERROR:", err);
      toast.error(formatSupabaseError(err));
    }
  };

  const handleGroupSave = async (items: EvaluacionUpsertItem[]) => {
    try {
      await batchUpsert.mutateAsync(items);
      toast.success(`${items.length} evaluación(es) guardada(s)`);
    } catch (err) {
      console.error("TEACHER GROUP BATCH ERROR:", err);
      toast.error(formatSupabaseError(err));
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
          <div>
            <p className="text-sm font-medium">Año académico</p>
            <p className="text-lg font-semibold">{ano}</p>
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

      {horariosList.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar horarios: {(horariosList.error as Error)?.message}
        </div>
      )}

      {rubricasList.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar rúbricas: {(rubricasList.error as Error)?.message}
        </div>
      )}

      <Tabs defaultValue="individuales">
        <TabsList>
          <TabsTrigger value="individuales" className="gap-2">
            <User className="h-4 w-4" />
            Clases individuales
            <Badge variant="secondary">{roster.individuales.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="grupos" className="gap-2">
            <Users className="h-4 w-4" />
            Grupos
            <Badge variant="secondary">{roster.grupos.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="individuales" className="mt-4">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : roster.individuales.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              No tienes clases individuales asignadas en tu horario.
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roster.individuales.map((student) => {
                const evaluated = !!evaluationIndex.get(
                  evaluationLookupKey(trimestre, student.idAlumno, student.idEspecialidad),
                );
                return (
                  <Card
                    key={`${student.idAlumno}-${student.idEspecialidad}`}
                    className="cursor-pointer p-4 transition-colors hover:bg-muted/40"
                    onClick={() => setSelectedStudent(student)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{student.nombreAlumno}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {student.nombreEspecialidad}
                        </p>
                      </div>
                      <EvaluationStatusBadge evaluated={evaluated} />
                    </div>
                  </Card>
                );
              })}
            </div>
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
                    evaluationLookupKey(trimestre, s.idAlumno, s.idEspecialidad),
                  ),
                ).length;

                return (
                  <AccordionItem key={group.idGrupo} value={group.idGrupo}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex flex-1 items-center justify-between gap-3 pr-2 text-left">
                        <div>
                          <p className="font-medium">{group.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {group.students.length} alumno(s)
                          </p>
                        </div>
                        <Badge variant="outline">
                          {evaluatedCount}/{group.students.length} evaluados
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <GroupBulkEvaluationPanel
                        group={group}
                        trimestre={trimestre}
                        ano={ano}
                        evaluationIndex={evaluationIndex}
                        activeRubricas={activeRubricas}
                        submitting={submitting}
                        onSave={handleGroupSave}
                      />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </TabsContent>
      </Tabs>

      {selectedStudent && (
        <TeacherIndividualEvalDialog
          student={selectedStudent}
          trimestre={trimestre}
          ano={ano}
          evaluationIndex={evaluationIndex}
          activeRubricas={activeRubricas}
          open
          onClose={() => setSelectedStudent(null)}
          submitting={submitting}
          onSubmit={handleIndividualSave}
        />
      )}
    </div>
  );
}
