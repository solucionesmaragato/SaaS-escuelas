import { Fragment, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AlumnoTree } from "@/hooks/useAlumnosTree";
import { useMatriculas, type MatriculaRow } from "@/hooks/useMatriculas";
import {
  useGrupos,
  isGrupoEstadoActivo,
  type GrupoData,
  type GrupoHorarioData,
} from "@/hooks/useGrupos";
import { useIncidencias, type IncidenciaData } from "@/hooks/useIncidencias";
import { useEvaluaciones, type EvaluacionData } from "@/hooks/useEvaluaciones";
import { useRubricas, type RubricaData } from "@/hooks/useRubricas";
import { useCentros, getActiveCursoEscolar, type CursoEscolarData } from "@/hooks/useCentros";
import { parseRubricCriteria, parseResultadosRubrica } from "@/lib/rubricStructure";
import type { OnNavigateToEntity } from "@/lib/entityNavigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type LookupMaps = {
  profesorById: Map<string, string>;
  aulaById: Map<string, string>;
  tarifaById: Map<string, string>;
  especialidadById: Map<string, string>;
};

const SIN_CURSO_KEY = "__sin_curso__";

function incidenciaConsultaBadgeStatus(
  estado: string | null | undefined,
): "success" | "info" | "pending" | "neutral" {
  const v = estado?.trim() ?? "Pendiente";
  if (v === "Resuelto") return "success";
  if (v === "Justificada") return "info";
  if (v === "Pendiente") return "pending";
  return "neutral";
}

function normalizeMatriculaEstado(estado: string | null | undefined): "Activo" | "Inactivo" {
  return estado?.trim().toLowerCase() === "inactivo" ? "Inactivo" : "Activo";
}

function MatriculaEstadoBadge({ estado }: { estado: string | null | undefined }) {
  const label = normalizeMatriculaEstado(estado);
  const active = label === "Activo";
  return (
    <StatusBadge status={active ? "success" : "destructive"} className="font-medium">
      <span
        className={cn(
          "mr-1.5 inline-block h-2 w-2 rounded-full md:hidden",
          active ? "bg-green-600" : "bg-red-500",
        )}
        aria-hidden
      />
      <span className="hidden md:inline">{label}</span>
    </StatusBadge>
  );
}

function GrupoEstadoBadge({ estado }: { estado: string | null | undefined }) {
  const active = isGrupoEstadoActivo(estado);
  return (
    <StatusBadge status={active ? "success" : "destructive"} className="font-medium">
      <span
        className={cn(
          "mr-1.5 inline-block h-2 w-2 rounded-full md:hidden",
          active ? "bg-green-600" : "bg-red-500",
        )}
        aria-hidden
      />
      <span className="hidden md:inline">{active ? "Activo" : "Inactivo"}</span>
    </StatusBadge>
  );
}

function occupancyBadge(count: number, max: number | null) {
  if (max == null || max <= 0) {
    return (
      <Badge variant="secondary" className="text-xs font-normal">
        {count} alumnos
      </Badge>
    );
  }
  const ratio = count / max;
  const variant = ratio >= 1 ? "destructive" : ratio >= 0.8 ? "default" : "secondary";
  return (
    <Badge variant={variant} className="text-xs font-normal tabular-nums">
      {count} / {max}
    </Badge>
  );
}

function formatHora(hora: string | null | undefined): string {
  return hora?.slice(0, 5) ?? "—";
}

function formatHorarioSlotCell(horario: GrupoHorarioData): string {
  const dia = horario.DIA_SEMANA ?? "—";
  const inicio = formatHora(horario.HORA_INICIO);
  const fin = formatHora(horario.HORA_FIN);
  if (inicio === "—" && fin === "—") return dia;
  return `${dia} ${inicio} - ${fin}`;
}

function formatHorarioMatriculaSchedule(
  dia: string | null | undefined,
  horaInicio: string | null | undefined,
  horaFin: string | null | undefined,
): string {
  const day = dia?.trim() || "—";
  const start = horaInicio?.slice(0, 5) ?? "";
  const end = horaFin?.slice(0, 5) ?? "";
  if (start && end) return `${day}, ${start}–${end}`;
  if (start) return `${day}, ${start}`;
  return day;
}

function formatNotaMedia(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : String(value);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-sm font-semibold tracking-tight">{children}</h4>;
}

function EmptySectionRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-6 text-center text-sm text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}

function MatriculasSubSection({
  matriculas,
  especialidadById,
  lookups,
  alumnoId,
  onNavigateToEntity,
}: {
  matriculas: MatriculaRow[];
  especialidadById: Map<string, string>;
  lookups: LookupMaps;
  alumnoId: string;
  onNavigateToEntity: OnNavigateToEntity;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <SectionTitle>Matrículas</SectionTitle>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Especialidad</TableHead>
              <TableHead>Profesor Asignado</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha Alta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matriculas.length === 0 ? (
              <EmptySectionRow colSpan={5} message="Sin matrículas en este curso." />
            ) : (
              matriculas.map((m) => {
                const isExpanded = expanded.has(m.ID_MATRICULA);
                const horarios = m.HORARIOS_MATRICULAS ?? [];
                return (
                  <Fragment key={m.ID_MATRICULA}>
                    <TableRow
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() =>
                        onNavigateToEntity({
                          to: "/matriculas",
                          search: { matriculaId: m.ID_MATRICULA },
                        })
                      }
                    >
                      <TableCell className="w-10 px-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                          aria-label={isExpanded ? "Contraer horarios" : "Expandir horarios"}
                          onClick={() => toggle(m.ID_MATRICULA)}
                        >
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-muted-foreground transition-transform",
                              isExpanded && "rotate-180",
                            )}
                            aria-hidden
                          />
                        </button>
                      </TableCell>
                      <TableCell>
                        {m.ESPECIALIDADES?.ESPECIALIDAD ?? (
                          <span className="text-muted-foreground text-xs font-mono">
                            {m.ESPECIALIDAD || "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {m.PROFESOR?.NOMBRE_PROFESOR ? (
                          m.PROFESOR.NOMBRE_PROFESOR
                        ) : (
                          <span className="text-muted-foreground">Sin asignar</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <MatriculaEstadoBadge estado={m.ESTADO} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.FECHA_ALTA ?? "—"}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={5} className="p-0">
                          <div className="p-3">
                            {horarios.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                Sin horarios registrados para esta matrícula.
                              </p>
                            ) : (
                              <div className="overflow-x-auto rounded-md border bg-background">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Especialidad</TableHead>
                                      <TableHead>Horario</TableHead>
                                      <TableHead>Saldo</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {horarios.map((horario) => {
                                      const especialidadId =
                                        horario.ID_ESPECIALIDAD ?? m.ESPECIALIDAD;
                                      return (
                                        <TableRow
                                          key={horario.ID_HORARIO}
                                          className="cursor-pointer transition-colors hover:bg-muted/40"
                                          onClick={() =>
                                            onNavigateToEntity({
                                              to: "/sesiones",
                                              search: { alumnoId },
                                            })
                                          }
                                        >
                                          <TableCell>
                                            {especialidadId
                                              ? (especialidadById.get(especialidadId) ??
                                                lookups.especialidadById.get(especialidadId) ??
                                                especialidadId)
                                              : "—"}
                                          </TableCell>
                                          <TableCell>
                                            {formatHorarioMatriculaSchedule(
                                              horario.DIA,
                                              horario.HORA_INICIO,
                                              horario.HORA_FIN,
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            {horario.SALDO != null ? horario.SALDO : "—"}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function GruposSubSection({
  grupos,
  onNavigateToEntity,
}: {
  grupos: GrupoData[];
  onNavigateToEntity: OnNavigateToEntity;
}) {
  return (
    <div className="space-y-2">
      <SectionTitle>Grupos</SectionTitle>
      <div className="overflow-x-auto rounded-md border">
        <Table className="w-full min-w-[700px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[20%]">Grupo</TableHead>
              <TableHead className="w-[14%]">Horario</TableHead>
              <TableHead className="w-[18%]">Profesor</TableHead>
              <TableHead className="w-[14%]">Aula</TableHead>
              <TableHead className="w-[18%]">Especialidad</TableHead>
              <TableHead className="w-[10%]">Ocupación</TableHead>
              <TableHead className="w-[88px]">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grupos.length === 0 ? (
              <EmptySectionRow colSpan={7} message="Sin grupos en este curso." />
            ) : (
              grupos.map((g) => (
                <TableRow
                  key={g.ID_GRUPO}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() =>
                    onNavigateToEntity({
                      to: "/grupos",
                      search: { grupoId: g.ID_GRUPO },
                    })
                  }
                >
                  <TableCell className="font-medium truncate">{g.NOMBRE_GRUPO}</TableCell>
                  <TableCell className="text-sm align-top">
                    {g.GRUPOS_HORARIOS.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {g.GRUPOS_HORARIOS.map((horario) => (
                          <span
                            key={horario.ID_GRUPO_HORARIO}
                            className="tabular-nums leading-snug"
                          >
                            {formatHorarioSlotCell(horario)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm align-top">
                    {g.GRUPOS_HORARIOS.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {g.GRUPOS_HORARIOS.map((horario) => (
                          <span
                            key={`${horario.ID_GRUPO_HORARIO}-prof`}
                            className="leading-snug"
                          >
                            {horario.PROFESOR?.NOMBRE_PROFESOR ?? "—"}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm align-top">
                    {g.GRUPOS_HORARIOS.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {g.GRUPOS_HORARIOS.map((horario) => (
                          <span
                            key={`${horario.ID_GRUPO_HORARIO}-aula`}
                            className="leading-snug"
                          >
                            {horario.AULA?.NOMBRE_AULA ?? "—"}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm break-words">{g.TEXTO_ESPECIALIDAD}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {occupancyBadge(g.ID_ALUMNOS.length, g.PLAZAS_MAXIMAS)}
                  </TableCell>
                  <TableCell className="w-[88px]">
                    <GrupoEstadoBadge estado={g.ESTADO} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function IncidenciasSubSection({ incidencias }: { incidencias: IncidenciaData[] }) {
  return (
    <div className="space-y-2">
      <SectionTitle>Incidencias</SectionTitle>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha / Horario</TableHead>
              <TableHead>Profesor</TableHead>
              <TableHead>Tipo Incidencia</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidencias.length === 0 ? (
              <EmptySectionRow colSpan={4} message="Sin incidencias en este curso." />
            ) : (
              incidencias.map((inc) => (
                <TableRow key={inc.ID_INCIDENCIA}>
                  <TableCell className="text-sm">
                    <div className="font-medium flex items-center gap-1">
                      {inc.FECHA_EXACTA ?? "—"}
                    </div>
                    {(inc.HORA_INICIO || inc.HORA_FIN) && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {inc.HORA_INICIO ?? "—"} a {inc.HORA_FIN ?? "—"}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {inc.PROFESOR?.NOMBRE_PROFESOR ?? (
                      <span className="text-muted-foreground text-xs">
                        {inc.ID_PROFESOR || "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <StatusBadge
                      status={
                        inc.TIPO_INCIDENCIA === "Consulta"
                          ? "info"
                          : inc.TIPO_INCIDENCIA === "Falta"
                            ? "destructive"
                            : inc.TIPO_INCIDENCIA === "Recuperación"
                              ? "success"
                              : "neutral"
                      }
                    >
                      {inc.TIPO_INCIDENCIA ?? "—"}
                    </StatusBadge>
                    {inc.TIPO_FALTA && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Detalle: {inc.TIPO_FALTA}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={incidenciaConsultaBadgeStatus(inc.ESTADO_CONSULTA)}
                      className="text-xs font-normal"
                    >
                      {inc.ESTADO_CONSULTA ?? "Pendiente"}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EvaluacionesSubSection({
  evaluaciones,
  lookups,
  rubricaById,
}: {
  evaluaciones: EvaluacionData[];
  lookups: LookupMaps;
  rubricaById: Map<string, RubricaData>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <SectionTitle>Evaluaciones</SectionTitle>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Trimestre</TableHead>
              <TableHead>Especialidad</TableHead>
              <TableHead className="text-right">Nota final</TableHead>
              <TableHead>Profesor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evaluaciones.length === 0 ? (
              <EmptySectionRow colSpan={5} message="Sin evaluaciones en este curso." />
            ) : (
              evaluaciones.map((row) => {
                const isExpanded = expanded.has(row.ID_EVALUACION);
                const rubrica = row.ID_RUBRICA ? (rubricaById.get(row.ID_RUBRICA) ?? null) : null;
                const criterios = parseRubricCriteria(rubrica?.ESTRUCTURA);
                const resultados = parseResultadosRubrica(row.RESULTADOS_RUBRICA);
                return (
                  <Fragment key={row.ID_EVALUACION}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggle(row.ID_EVALUACION)}
                    >
                      <TableCell className="w-10 px-2">
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            isExpanded && "rotate-180",
                          )}
                          aria-hidden
                        />
                      </TableCell>
                      <TableCell>{row.TRIMESTRE === "FINAL" ? "Final" : row.TRIMESTRE}</TableCell>
                      <TableCell>
                        {lookups.especialidadById.get(row.ID_ESPECIALIDAD) || "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNotaMedia(row.NOTA_MEDIA)}
                      </TableCell>
                      <TableCell>
                        {row.ID_PROFESOR && lookups.profesorById.get(row.ID_PROFESOR)
                          ? lookups.profesorById.get(row.ID_PROFESOR)
                          : "—"}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={5} className="p-3">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            Criterios de la rúbrica
                          </p>
                          {criterios.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {rubrica
                                ? "Esta rúbrica no tiene criterios definidos."
                                : "No hay una rúbrica asociada a esta evaluación."}
                            </p>
                          ) : (
                            <ul className="divide-y rounded-md border bg-background text-sm">
                              {criterios.map((criterio) => (
                                <li
                                  key={criterio.key}
                                  className="flex items-center justify-between gap-3 px-3 py-2"
                                >
                                  <span className="text-muted-foreground">{criterio.label}</span>
                                  <span className="font-medium">
                                    {resultados[criterio.key] ?? resultados[criterio.label] ?? "—"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function sortCursoIds(ids: string[], cursoById: Map<string, CursoEscolarData>): string[] {
  return [...ids].sort((a, b) => {
    if (a === SIN_CURSO_KEY) return 1;
    if (b === SIN_CURSO_KEY) return -1;
    const cursoA = cursoById.get(a);
    const cursoB = cursoById.get(b);
    const fechaA = cursoA?.FECHA_INICIO ?? "";
    const fechaB = cursoB?.FECHA_INICIO ?? "";
    if (fechaA && fechaB) return fechaB.localeCompare(fechaA);
    return (cursoB?.NOMBRE_CURSO ?? "").localeCompare(cursoA?.NOMBRE_CURSO ?? "", "es", {
      sensitivity: "base",
    });
  });
}

export function AlumnoAcademicoTab({
  alumno,
  lookups,
  onNavigateToEntity,
}: {
  alumno: AlumnoTree;
  lookups: LookupMaps;
  onNavigateToEntity: OnNavigateToEntity;
}) {
  const alumnoId = alumno.ID_ALUMNO;
  const { list: matriculasList } = useMatriculas(undefined, alumnoId);
  const { list: gruposList } = useGrupos(undefined, alumnoId);
  const { list: incidenciasList } = useIncidencias(undefined, alumnoId);
  const { list: evaluacionesList } = useEvaluaciones(undefined, alumnoId);
  const { list: rubricasList } = useRubricas();
  const { list: centrosList } = useCentros();

  const isLoading =
    matriculasList.isLoading ||
    gruposList.isLoading ||
    incidenciasList.isLoading ||
    evaluacionesList.isLoading;

  const isError =
    matriculasList.isError ||
    gruposList.isError ||
    incidenciasList.isError ||
    evaluacionesList.isError;

  // Filtrado por alumnoId ya se resuelve en el servidor (Supabase .eq/.contains
  // dentro de los hooks); estas listas ya vienen acotadas a este alumno.
  const matriculas = useMemo(() => matriculasList.data?.rows ?? [], [matriculasList.data]);
  const matriculasEspecialidadById =
    matriculasList.data?.especialidadById ?? new Map<string, string>();
  const grupos = useMemo(() => gruposList.data?.grupos ?? [], [gruposList.data]);
  const incidencias = useMemo(() => incidenciasList.data ?? [], [incidenciasList.data]);
  const evaluaciones = useMemo(() => evaluacionesList.data ?? [], [evaluacionesList.data]);

  const rubricaById = useMemo(
    () => new Map((rubricasList.data ?? []).map((r) => [r.ID_RUBRICA, r])),
    [rubricasList.data],
  );

  const cursoById = useMemo(() => {
    const map = new Map<string, CursoEscolarData>();
    for (const centro of centrosList.data ?? []) {
      for (const curso of centro.CURSO_ESCOLAR ?? []) {
        map.set(curso.ID_CURSO, curso);
      }
    }
    return map;
  }, [centrosList.data]);

  const activeCursoId = useMemo(() => {
    const centroDelAlumno = (centrosList.data ?? []).find((c) => c.ID_CENTRO === alumno.ID_CENTRO);
    const activo = getActiveCursoEscolar(centroDelAlumno?.CURSO_ESCOLAR ?? []);
    return activo?.ID_CURSO ?? null;
  }, [centrosList.data, alumno.ID_CENTRO]);

  const cursoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of matriculas) ids.add(m.ID_CURSO || SIN_CURSO_KEY);
    for (const g of grupos) ids.add(g.ID_CURSO || SIN_CURSO_KEY);
    for (const i of incidencias) ids.add(i.ID_CURSO || SIN_CURSO_KEY);
    for (const e of evaluaciones) ids.add(e.ID_CURSO || SIN_CURSO_KEY);
    if (activeCursoId) ids.add(activeCursoId);
    return sortCursoIds([...ids], cursoById);
  }, [matriculas, grupos, incidencias, evaluaciones, activeCursoId, cursoById]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-6 text-center text-sm text-destructive">
        Error al cargar el historial académico del alumno.
      </p>
    );
  }

  if (cursoIds.length === 0) {
    return (
      <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        No hay historial académico disponible para este alumno.
      </p>
    );
  }

  return (
    <Accordion
      type="multiple"
      defaultValue={activeCursoId ? [activeCursoId] : []}
      className="w-full"
    >
      {cursoIds.map((cursoId) => {
        const curso = cursoId === SIN_CURSO_KEY ? null : cursoById.get(cursoId);
        const label = curso?.NOMBRE_CURSO ?? "Curso sin identificar";

        return (
          <AccordionItem key={cursoId} value={cursoId}>
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                {label}
                {cursoId === activeCursoId && (
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    Activo
                  </Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-6">
                <MatriculasSubSection
                  matriculas={matriculas.filter((m) => (m.ID_CURSO || SIN_CURSO_KEY) === cursoId)}
                  especialidadById={matriculasEspecialidadById}
                  lookups={lookups}
                  alumnoId={alumnoId}
                  onNavigateToEntity={onNavigateToEntity}
                />
                <GruposSubSection
                  grupos={grupos.filter((g) => (g.ID_CURSO || SIN_CURSO_KEY) === cursoId)}
                  onNavigateToEntity={onNavigateToEntity}
                />
                <IncidenciasSubSection
                  incidencias={incidencias.filter((i) => (i.ID_CURSO || SIN_CURSO_KEY) === cursoId)}
                />
                <EvaluacionesSubSection
                  evaluaciones={evaluaciones.filter(
                    (e) => (e.ID_CURSO || SIN_CURSO_KEY) === cursoId,
                  )}
                  lookups={lookups}
                  rubricaById={rubricaById}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
