import { useMemo, useState } from "react";
import { Calendar, ChevronRight, GraduationCap, UserRound } from "lucide-react";
import {
  useAlumnosProfesor,
  type ProfesorAlumnoHorario,
  type ProfesorAlumnoLista,
} from "@/hooks/useAlumnosProfesor";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const dayOrder: Record<string, number> = {
  Lunes: 1,
  Martes: 2,
  Miercoles: 3,
  Miércoles: 3,
  Jueves: 4,
  Viernes: 5,
  Sabado: 6,
  Sábado: 6,
  Domingo: 7,
};

function normalizeDayKey(dia: string | null | undefined): string {
  if (!dia) return "";
  return dia.normalize("NFD").replace(/\p{M}/gu, "");
}

function getDaySortKey(dia: string | null | undefined): number {
  if (!dia) return 99;
  const normalized = normalizeDayKey(dia);
  return dayOrder[normalized] ?? dayOrder[dia] ?? 99;
}

function formatFechaNacimiento(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-ES");
}

function formatHorarioRange(
  inicio: string | null | undefined,
  fin: string | null | undefined,
): string {
  const start = inicio?.slice(0, 5) ?? "—";
  const end = fin?.slice(0, 5) ?? "—";
  return `${start} – ${end}`;
}

function formatTutores(tutores: ProfesorAlumnoLista["TUTORES"]): string {
  if (tutores.length === 0) return "Sin tutor asignado";
  return tutores.map((t) => t.NOMBRE_PROFESOR).join(", ");
}

function sortHorarios(rows: ProfesorAlumnoHorario[]): ProfesorAlumnoHorario[] {
  return [...rows].sort(
    (a, b) =>
      (a.NOMBRE_CENTRO ?? "").localeCompare(b.NOMBRE_CENTRO ?? "", "es") ||
      getDaySortKey(a.DIA) - getDaySortKey(b.DIA) ||
      (a.HORA_INICIO ?? "").localeCompare(b.HORA_INICIO ?? ""),
  );
}

function AlumnoRow({ alumno, onOpen }: { alumno: ProfesorAlumnoLista; onOpen: () => void }) {
  const edadLabel =
    alumno.EDAD != null
      ? `${alumno.EDAD} años`
      : alumno.NACIMIENTO
        ? formatFechaNacimiento(alumno.NACIMIENTO)
        : "Edad no registrada";

  return (
    <Card className="p-4">
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 text-left">
        <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{alumno.NOMBRE_ALUMNO || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {edadLabel}
                {alumno.NACIMIENTO && alumno.EDAD != null
                  ? ` · ${formatFechaNacimiento(alumno.NACIMIENTO)}`
                  : ""}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Tutor:</span>{" "}
            {formatTutores(alumno.TUTORES)}
          </p>
        </div>
      </button>
    </Card>
  );
}

function HorarioDetailRow({ horario }: { horario: ProfesorAlumnoHorario }) {
  return (
    <Card className="p-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{horario.NOMBRE_CENTRO ?? "Centro sin nombre"}</Badge>
          {horario.ESPECIALIDAD ? <Badge variant="secondary">{horario.ESPECIALIDAD}</Badge> : null}
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Día y horario</p>
            <p className="font-medium">
              {horario.DIA ?? "—"} · {formatHorarioRange(horario.HORA_INICIO, horario.HORA_FIN)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Profesor del horario</p>
            <p className="font-medium">{horario.NOMBRE_PROFESOR ?? "Sin asignar"}</p>
          </div>
          {horario.TIPO_CLASE ? (
            <div>
              <p className="text-xs text-muted-foreground">Tipo de clase</p>
              <p className="font-medium">{horario.TIPO_CLASE}</p>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function TeacherAlumnosDashboard() {
  const { list, horarios } = useAlumnosProfesor();
  const [selectedAlumno, setSelectedAlumno] = useState<ProfesorAlumnoLista | null>(null);

  const alumnos = useMemo(() => list.data ?? [], [list.data]);

  const horariosByAlumno = useMemo(() => {
    const map = new Map<string, ProfesorAlumnoHorario[]>();
    for (const row of horarios.data ?? []) {
      const current = map.get(row.ID_ALUMNO) ?? [];
      current.push(row);
      map.set(row.ID_ALUMNO, current);
    }
    for (const [key, rows] of map) {
      map.set(key, sortHorarios(rows));
    }
    return map;
  }, [horarios.data]);

  const selectedHorarios = selectedAlumno
    ? (horariosByAlumno.get(selectedAlumno.ID_ALUMNO) ?? [])
    : [];

  return (
    <>
      {list.isLoading || horarios.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : null}

      {list.isError ? (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Error al cargar alumnos: {(list.error as Error)?.message}
        </Card>
      ) : null}

      {!list.isLoading && !list.isError ? (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GraduationCap className="h-4 w-4" />
            {alumnos.length} alumno{alumnos.length === 1 ? "" : "s"} con horario activo contigo
          </div>

          {alumnos.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No tienes alumnos con horarios activos asignados.
            </Card>
          ) : (
            <div className="space-y-3">
              {alumnos.map((alumno) => (
                <AlumnoRow
                  key={alumno.ID_ALUMNO}
                  alumno={alumno}
                  onOpen={() => setSelectedAlumno(alumno)}
                />
              ))}
            </div>
          )}
        </>
      ) : null}

      <Dialog open={!!selectedAlumno} onOpenChange={(open) => !open && setSelectedAlumno(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedAlumno?.NOMBRE_ALUMNO ?? "Alumno"}</DialogTitle>
          </DialogHeader>

          {selectedAlumno ? (
            <div className="space-y-4">
              <Card className="p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {selectedAlumno.EDAD != null
                        ? `${selectedAlumno.EDAD} años`
                        : "Edad no registrada"}
                      {selectedAlumno.NACIMIENTO
                        ? ` · ${formatFechaNacimiento(selectedAlumno.NACIMIENTO)}`
                        : ""}
                    </span>
                  </div>
                  <p>
                    <span className="font-medium">Tutor:</span>{" "}
                    {formatTutores(selectedAlumno.TUTORES)}
                  </p>
                </div>
              </Card>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Horarios activos en tus centros ({selectedHorarios.length})
                </p>
                {horarios.isError ? (
                  <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                    Error al cargar horarios: {(horarios.error as Error)?.message}
                  </Card>
                ) : selectedHorarios.length === 0 ? (
                  <Card className="p-4 text-sm text-muted-foreground">
                    No hay horarios activos visibles para este alumno en tus centros.
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {selectedHorarios.map((horario) => (
                      <HorarioDetailRow key={horario.ID_HORARIO} horario={horario} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
