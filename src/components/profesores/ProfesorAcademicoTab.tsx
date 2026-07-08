import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useGrupos, isGrupoEstadoActivo, type GrupoData } from "@/hooks/useGrupos";
import { useEvaluaciones, type EvaluacionData } from "@/hooks/useEvaluaciones";
import {
  buildTeacherRoster,
  formatHorarioSlotLabel,
  useTeacherHorarios,
  type TeacherHorarioGroup,
  type TeacherHorarioStudent,
} from "@/hooks/useTeacherHorarios";
import { EntityLink } from "@/components/navigation/EntityLink";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-6 text-center text-sm text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}

function GrupoEstadoBadge({ estado }: { estado: string | null | undefined }) {
  const active = isGrupoEstadoActivo(estado);
  return (
    <StatusBadge status={active ? "success" : "destructive"} className="font-medium">
      {active ? "Activo" : "Inactivo"}
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

function formatNotaMedia(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : String(value);
}

function HorarioSlots({ student }: { student: TeacherHorarioStudent }) {
  if (student.horarios.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {student.horarios.map((slot, idx) => (
        <Badge key={idx} variant="outline" className="text-xs font-normal whitespace-nowrap">
          {formatHorarioSlotLabel(slot)}
        </Badge>
      ))}
    </div>
  );
}

function AlumnosSubTab({
  individuales,
  grupos,
  isLoading,
  onOpenAlumno,
}: {
  individuales: TeacherHorarioStudent[];
  grupos: TeacherHorarioGroup[];
  isLoading: boolean;
  onOpenAlumno: (idAlumno: string) => void;
}) {
  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const hasContent = individuales.length > 0 || grupos.length > 0;
  if (!hasContent) {
    return (
      <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        Este profesor no tiene alumnos asignados.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {individuales.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold tracking-tight">Clases individuales</h4>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alumno</TableHead>
                  <TableHead>Especialidad</TableHead>
                  <TableHead>Horario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {individuales.map((s) => (
                  <TableRow
                    key={`${s.idAlumno}-${s.idEspecialidad}`}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => onOpenAlumno(s.idAlumno)}
                  >
                    <TableCell
                      className="font-medium text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EntityLink type="alumno" id={s.idAlumno}>
                        {s.nombreAlumno}
                      </EntityLink>
                    </TableCell>
                    <TableCell className="text-sm">{s.nombreEspecialidad}</TableCell>
                    <TableCell>
                      <HorarioSlots student={s} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {grupos.map((g) => (
        <div key={g.idGrupo} className="space-y-2">
          <h4 className="text-sm font-semibold tracking-tight">{g.label}</h4>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alumno</TableHead>
                  <TableHead>Especialidad</TableHead>
                  <TableHead>Horario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.students.length === 0 ? (
                  <EmptyRow colSpan={3} message="Sin alumnos en este grupo." />
                ) : (
                  g.students.map((s) => (
                    <TableRow
                      key={`${g.idGrupo}-${s.idAlumno}-${s.idEspecialidad}`}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => onOpenAlumno(s.idAlumno)}
                    >
                      <TableCell
                        className="font-medium text-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <EntityLink type="alumno" id={s.idAlumno}>
                          {s.nombreAlumno}
                        </EntityLink>
                      </TableCell>
                      <TableCell className="text-sm">{s.nombreEspecialidad}</TableCell>
                      <TableCell>
                        <HorarioSlots student={s} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}

function GruposSubTab({
  grupos,
  isLoading,
  onOpenGrupo,
}: {
  grupos: GrupoData[];
  isLoading: boolean;
  onOpenGrupo: (idGrupo: string) => void;
}) {
  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table className="w-full min-w-[700px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[22%]">Grupo</TableHead>
            <TableHead className="w-[18%]">Horario</TableHead>
            <TableHead className="w-[16%]">Aula</TableHead>
            <TableHead className="w-[20%]">Especialidad</TableHead>
            <TableHead className="w-[12%]">Ocupación</TableHead>
            <TableHead className="w-[12%]">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grupos.length === 0 ? (
            <EmptyRow colSpan={6} message="Sin grupos asignados a este profesor." />
          ) : (
            grupos.map((g) => (
              <TableRow
                key={g.ID_GRUPO}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => onOpenGrupo(g.ID_GRUPO)}
              >
                <TableCell className="font-medium truncate" onClick={(e) => e.stopPropagation()}>
                  <EntityLink type="grupo" id={g.ID_GRUPO}>
                    {g.NOMBRE_GRUPO}
                  </EntityLink>
                </TableCell>
                <TableCell className="text-sm">{g.TEXTO_HORARIO}</TableCell>
                <TableCell className="text-sm">{g.TEXTO_AULA}</TableCell>
                <TableCell className="text-sm break-words">{g.TEXTO_ESPECIALIDAD}</TableCell>
                <TableCell>{occupancyBadge(g.ID_ALUMNOS.length, g.PLAZAS_MAXIMAS)}</TableCell>
                <TableCell>
                  <GrupoEstadoBadge estado={g.ESTADO} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function EvaluacionesSubTab({
  evaluaciones,
  alumnoById,
  especialidadById,
  isLoading,
  onOpenEvaluacion,
}: {
  evaluaciones: EvaluacionData[];
  alumnoById: Map<string, string>;
  especialidadById: Map<string, string>;
  isLoading: boolean;
  onOpenEvaluacion: (idAlumno: string) => void;
}) {
  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Alumno</TableHead>
            <TableHead>Trimestre</TableHead>
            <TableHead>Especialidad</TableHead>
            <TableHead className="text-right">Nota final</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {evaluaciones.length === 0 ? (
            <EmptyRow colSpan={5} message="Sin evaluaciones registradas por este profesor." />
          ) : (
            evaluaciones.map((e) => (
              <TableRow
                key={e.ID_EVALUACION}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => onOpenEvaluacion(e.ID_ALUMNO)}
              >
                <TableCell className="font-medium text-sm">
                  {alumnoById.get(e.ID_ALUMNO) ?? e.ID_ALUMNO}
                </TableCell>
                <TableCell className="text-sm">
                  {e.TRIMESTRE === "FINAL" ? "Final" : e.TRIMESTRE}
                </TableCell>
                <TableCell className="text-sm">
                  {especialidadById.get(e.ID_ESPECIALIDAD) ?? e.ID_ESPECIALIDAD}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatNotaMedia(e.NOTA_MEDIA)}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={e.ESTADO === "Borrador" ? "pending" : "success"}
                    className="text-xs font-normal"
                  >
                    {e.ESTADO ?? "—"}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function ProfesorAcademicoTab({ profesorId }: { profesorId: string }) {
  const navigate = useNavigate();
  const { list: horariosList } = useTeacherHorarios(profesorId);
  const { list: gruposList } = useGrupos(undefined, undefined, profesorId);
  const { list: evaluacionesList } = useEvaluaciones(undefined, undefined, profesorId);

  const grupos = useMemo(() => gruposList.data?.grupos ?? [], [gruposList.data]);
  const evaluaciones = useMemo(() => evaluacionesList.data ?? [], [evaluacionesList.data]);

  const alumnoById = useMemo(
    () => new Map((gruposList.data?.diccionarioAlumnos ?? []).map((a) => [a.ID_ALUMNO, a.NOMBRE_ALUMNO])),
    [gruposList.data],
  );
  const especialidadById = useMemo(
    () =>
      new Map(
        (gruposList.data?.diccionarioEspecialidades ?? []).map((e) => [
          e.ID_ESPECIALIDAD,
          e.ESPECIALIDAD,
        ]),
      ),
    [gruposList.data],
  );
  const grupoById = useMemo(
    () =>
      new Map(
        grupos.map((g) => [
          g.ID_GRUPO,
          { nombreGrupo: g.NOMBRE_GRUPO, nombreEspecialidad: g.TEXTO_ESPECIALIDAD || g.NOMBRE_GRUPO },
        ]),
      ),
    [grupos],
  );

  const roster = useMemo(
    () => buildTeacherRoster(horariosList.data ?? [], alumnoById, especialidadById, grupoById),
    [horariosList.data, alumnoById, especialidadById, grupoById],
  );

  const handleOpenAlumno = (idAlumno: string) => {
    void navigate({ to: "/alumnos", search: { studentId: idAlumno } });
  };
  const handleOpenGrupo = (idGrupo: string) => {
    void navigate({ to: "/grupos", search: { grupoId: idGrupo } });
  };
  const handleOpenEvaluacion = (idAlumno: string) => {
    void navigate({ to: "/evaluaciones", search: { profesorId, alumnoId: idAlumno } });
  };

  return (
    <Tabs defaultValue="alumnos" className={cn("w-full")}>
      <TabsList className="mb-4 grid w-full max-w-lg grid-cols-3">
        <TabsTrigger value="alumnos">Alumnos</TabsTrigger>
        <TabsTrigger value="grupos">Grupos</TabsTrigger>
        <TabsTrigger value="evaluaciones">Evaluaciones</TabsTrigger>
      </TabsList>

      <TabsContent value="alumnos">
        <AlumnosSubTab
          individuales={roster.individuales}
          grupos={roster.grupos}
          isLoading={horariosList.isLoading}
          onOpenAlumno={handleOpenAlumno}
        />
      </TabsContent>

      <TabsContent value="grupos">
        <GruposSubTab
          grupos={grupos}
          isLoading={gruposList.isLoading}
          onOpenGrupo={handleOpenGrupo}
        />
      </TabsContent>

      <TabsContent value="evaluaciones">
        <EvaluacionesSubTab
          evaluaciones={evaluaciones}
          alumnoById={alumnoById}
          especialidadById={especialidadById}
          isLoading={evaluacionesList.isLoading}
          onOpenEvaluacion={handleOpenEvaluacion}
        />
      </TabsContent>
    </Tabs>
  );
}
