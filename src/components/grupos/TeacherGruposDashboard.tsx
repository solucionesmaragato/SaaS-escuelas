import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ClipboardList, Users } from "lucide-react";
import { toast } from "sonner";
import {
  canViewGruposNav,
  isGrupoEstadoActivo,
  useGrupos,
  type EspecialidadLookup,
  type GrupoData,
} from "@/hooks/useGrupos";
import { useIncidencias } from "@/hooks/useIncidencias";
import { useActiveTenant } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { scopeTenantQuery } from "@/lib/tenantQuery";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

type GrupoHorarioRow = GrupoData["GRUPOS_HORARIOS"][number];

type GrupoFranjaCard = {
  key: string;
  group: GrupoData;
  horario: GrupoHorarioRow;
};

type PasarListaTarget = {
  group: GrupoData;
  horario: GrupoHorarioRow;
};

function sortedHorariosForGrupo(g: GrupoData): GrupoHorarioRow[] {
  if (g.GRUPOS_HORARIOS.length > 0) {
    return [...g.GRUPOS_HORARIOS].sort(
      (a, b) =>
        getDaySortKey(a.DIA_SEMANA) - getDaySortKey(b.DIA_SEMANA) ||
        (a.HORA_INICIO ?? "").localeCompare(b.HORA_INICIO ?? ""),
    );
  }
  return [
    {
      ID_GRUPO_HORARIO: g.ID_GRUPO,
      DIA_SEMANA: g.DIA_SEMANA,
      HORA_INICIO: g.HORA_INICIO,
      HORA_FIN: g.HORA_FIN,
      ID_PROFESOR: null,
      ID_AULA: null,
      PROFESOR: null,
      AULA: null,
    },
  ];
}

function buildFranjaCards(
  groups: GrupoData[],
  profesorId: string | null | undefined,
): GrupoFranjaCard[] {
  const cards: GrupoFranjaCard[] = [];
  for (const group of groups) {
    for (const horario of sortedHorariosForGrupo(group)) {
      if (profesorId && horario.ID_PROFESOR && horario.ID_PROFESOR !== profesorId) continue;
      cards.push({
        key: `${group.ID_GRUPO}|${horario.ID_GRUPO_HORARIO}`,
        group,
        horario,
      });
    }
  }
  return cards.sort(
    (a, b) =>
      getDaySortKey(a.horario.DIA_SEMANA) - getDaySortKey(b.horario.DIA_SEMANA) ||
      (a.horario.HORA_INICIO ?? "").localeCompare(b.horario.HORA_INICIO ?? "") ||
      a.group.NOMBRE_GRUPO.localeCompare(b.group.NOMBRE_GRUPO, "es", { sensitivity: "base" }),
  );
}

function formatHora(hora: string | null | undefined): string {
  return hora?.slice(0, 5) ?? "—";
}

function formatFranjaLabel(horario: GrupoHorarioRow): string {
  const dia = horario.DIA_SEMANA ?? "—";
  const inicio = formatHora(horario.HORA_INICIO);
  const fin = formatHora(horario.HORA_FIN);
  return `${dia} · ${inicio} – ${fin}`;
}

const TIPO_FALTA_OPTIONS = ["Recuperable", "No recuperable"] as const;
type TipoFalta = (typeof TIPO_FALTA_OPTIONS)[number];

type HorarioMatriculaRow = {
  ID_HORARIO: string;
  ID_GRUPO: string | null;
  ID_GRUPO_HORARIO: string | null;
  ID_PROFESOR: string | null;
  ID_ALUMNO: string | null;
  ID_MATRICULA: string | null;
  ID_ESPECIALIDAD: string | null;
  ID_AULA: string | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
};

type SesionPasarListaRow = {
  ID_SESION: string;
  FECHA_EXACTA: string;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ID_PROFESOR: string | null;
  ESPECIALIDAD: string | null;
  ID_MATRICULA: string | null;
  ID_HORARIO: string | null;
  ID_AULA: string | null;
  ID_ALUMNO: string | null;
};

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return "";
}

function toTimeInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

function resolveEspecialidadId(
  value: string | null | undefined,
  especialidades: EspecialidadLookup[] | null | undefined,
): string {
  if (!value) return "";
  const list = Array.isArray(especialidades) ? especialidades : [];
  if (list.some((e) => e?.ID_ESPECIALIDAD === value)) return value;
  const byName = list.find((e) => e?.ESPECIALIDAD?.toLowerCase() === value.toLowerCase());
  return byName?.ID_ESPECIALIDAD ?? value;
}

function sesionSlotKey(s: Pick<SesionPasarListaRow, "HORA_INICIO" | "HORA_FIN">): string {
  return `${s.HORA_INICIO ?? ""}|${s.HORA_FIN ?? ""}`;
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function FranjaCard({
  group,
  horario,
  onSelect,
  onPasarLista,
}: {
  group: GrupoData;
  horario: GrupoHorarioRow;
  onSelect: () => void;
  onPasarLista: () => void;
}) {
  return (
    <Card className="cursor-pointer p-4 transition-colors hover:bg-muted/40" onClick={onSelect}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 max-[349px]:flex-col max-[349px]:gap-1.5">
        <div className="min-w-0 flex-1 max-[349px]:w-full">
          <p className="break-words font-medium leading-snug">{group.NOMBRE_GRUPO}</p>
          <p className="mt-1 text-sm text-muted-foreground">{formatFranjaLabel(horario)}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onPasarLista();
          }}
        >
          <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
          Pasar lista
        </Button>
      </div>
    </Card>
  );
}

function PasarListaDialog({
  target,
  open,
  onClose,
  alumnoNombreById,
  especialidades,
  profesorId,
}: {
  target: PasarListaTarget | null;
  open: boolean;
  onClose: () => void;
  alumnoNombreById: Map<string, string>;
  especialidades: EspecialidadLookup[];
  profesorId: string | null | undefined;
}) {
  const { tenantId, rol } = useActiveTenant();
  const { list: incidenciasList, create } = useIncidencias();
  const [selectedSlotKey, setSelectedSlotKey] = useState<string>("");
  const [selectedAlumnoIds, setSelectedAlumnoIds] = useState<Set<string>>(() => new Set());
  const [tipoFalta, setTipoFalta] = useState<TipoFalta>("Recuperable");

  const group = target?.group ?? null;
  const franja = target?.horario ?? null;
  const todayIso = useMemo(() => todayIsoLocal(), []);

  const enrolledAlumnos = useMemo(() => {
    if (!group) return [];
    return group.ID_ALUMNOS.map((id) => ({
      id,
      nombre: alumnoNombreById.get(id) ?? "—",
    }))
      .filter((a) => a.nombre !== "—")
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  }, [group, alumnoNombreById]);

  const horariosQuery = useQuery({
    queryKey: [
      "pasar-lista-horarios",
      tenantId,
      group?.ID_GRUPO,
      franja?.ID_GRUPO_HORARIO,
      profesorId,
    ],
    enabled: open && !!group && !!franja && !!profesorId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("HORARIOS_MATRICULAS")
        .select(
          "ID_HORARIO, ID_GRUPO, ID_GRUPO_HORARIO, ID_PROFESOR, ID_ALUMNO, ID_MATRICULA, ID_ESPECIALIDAD, ID_AULA, HORA_INICIO, HORA_FIN",
        )
        .eq("ID_GRUPO", group!.ID_GRUPO)
        .eq("ID_GRUPO_HORARIO", franja!.ID_GRUPO_HORARIO);
      if (profesorId) query = query.eq("ID_PROFESOR", profesorId);
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as HorarioMatriculaRow[];
    },
  });

  const horarioIds = useMemo(
    () =>
      Array.from(
        new Set(
          (horariosQuery.data ?? [])
            .map((h) => h.ID_HORARIO)
            .filter((id): id is string => Boolean(id)),
        ),
      ),
    [horariosQuery.data],
  );

  const horarioByAlumnoHorario = useMemo(() => {
    const map = new Map<string, HorarioMatriculaRow>();
    for (const row of horariosQuery.data ?? []) {
      if (row.ID_ALUMNO && row.ID_HORARIO) {
        map.set(`${row.ID_ALUMNO}|${row.ID_HORARIO}`, row);
      }
    }
    return map;
  }, [horariosQuery.data]);

  const sesionesQuery = useQuery({
    queryKey: [
      "pasar-lista-sesiones",
      tenantId,
      group?.ID_GRUPO,
      franja?.ID_GRUPO_HORARIO,
      profesorId,
      todayIso,
      horarioIds,
    ],
    enabled: open && !!group && !!franja && !!profesorId && horarioIds.length > 0,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("SESIONES")
        .select(
          "ID_SESION, FECHA_EXACTA, HORA_INICIO, HORA_FIN, ID_PROFESOR, ESPECIALIDAD, ID_MATRICULA, ID_HORARIO, ID_AULA, ID_ALUMNO",
        )
        .eq("FECHA_EXACTA", todayIso)
        .in("ID_HORARIO", horarioIds);
      if (profesorId) query = query.eq("ID_PROFESOR", profesorId);
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query.order("HORA_INICIO", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as SesionPasarListaRow[];
      if (!franja) return rows;
      return rows.filter(
        (s) =>
          formatHora(s.HORA_INICIO) === formatHora(franja.HORA_INICIO) &&
          formatHora(s.HORA_FIN) === formatHora(franja.HORA_FIN),
      );
    },
  });

  const sessionSlots = useMemo(() => {
    const seen = new Map<
      string,
      { key: string; horaInicio: string | null; horaFin: string | null }
    >();
    for (const sesion of sesionesQuery.data ?? []) {
      const key = sesionSlotKey(sesion);
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          horaInicio: sesion.HORA_INICIO,
          horaFin: sesion.HORA_FIN,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      (a.horaInicio ?? "").localeCompare(b.horaInicio ?? ""),
    );
  }, [sesionesQuery.data]);

  const sesionesInSlot = useMemo(() => {
    if (!selectedSlotKey) return [];
    return (sesionesQuery.data ?? []).filter((s) => sesionSlotKey(s) === selectedSlotKey);
  }, [sesionesQuery.data, selectedSlotKey]);

  const sesionByAlumnoId = useMemo(() => {
    const map = new Map<string, SesionPasarListaRow>();
    for (const sesion of sesionesInSlot) {
      if (sesion.ID_ALUMNO) map.set(sesion.ID_ALUMNO, sesion);
    }
    return map;
  }, [sesionesInSlot]);

  const existingFaltaKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const inc of incidenciasList.data ?? []) {
      if (inc.TIPO_INCIDENCIA === "Falta" && inc.ID_ALUMNO && inc.ID_SESION) {
        keys.add(`${inc.ID_ALUMNO}|${inc.ID_SESION}`);
      }
    }
    return keys;
  }, [incidenciasList.data]);

  const sessionsLoading = horariosQuery.isLoading || sesionesQuery.isLoading;
  const hasSessionsToday = sessionSlots.length > 0;

  useEffect(() => {
    if (!open) {
      setSelectedSlotKey("");
      setSelectedAlumnoIds(new Set());
      setTipoFalta("Recuperable");
      return;
    }
    if (sessionSlots.length === 1) {
      setSelectedSlotKey(sessionSlots[0]!.key);
    } else if (sessionSlots.length === 0) {
      setSelectedSlotKey("");
    }
  }, [open, sessionSlots]);

  useEffect(() => {
    setSelectedAlumnoIds(new Set());
  }, [selectedSlotKey]);

  const toggleAlumno = (alumnoId: string, checked: boolean) => {
    setSelectedAlumnoIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(alumnoId);
      else next.delete(alumnoId);
      return next;
    });
  };

  const resolveAlumnoEspecialidadId = (sesion: SesionPasarListaRow): string | null => {
    const fromSesion = resolveEspecialidadId(sesion.ESPECIALIDAD, especialidades);
    if (fromSesion) return fromSesion;
    if (sesion.ID_ALUMNO && sesion.ID_HORARIO) {
      const horario = horarioByAlumnoHorario.get(`${sesion.ID_ALUMNO}|${sesion.ID_HORARIO}`);
      if (horario?.ID_ESPECIALIDAD) return horario.ID_ESPECIALIDAD;
    }
    return group?.ID_ESPECIALIDAD ?? null;
  };

  const handleSave = async () => {
    if (!group || !franja || !selectedSlotKey || sessionSlots.length === 0) return;

    const alumnosToSave = enrolledAlumnos.filter((alumno) => {
      if (!selectedAlumnoIds.has(alumno.id)) return false;
      const sesion = sesionByAlumnoId.get(alumno.id);
      if (!sesion) return false;
      return !existingFaltaKeys.has(`${alumno.id}|${sesion.ID_SESION}`);
    });

    if (alumnosToSave.length === 0) {
      toast.error("Selecciona al menos un alumno sin falta marcada.");
      return;
    }

    try {
      for (const alumno of alumnosToSave) {
        const sesion = sesionByAlumnoId.get(alumno.id)!;
        await create.mutateAsync({
          ID_ALUMNO: alumno.id,
          TIPO_INCIDENCIA: "Falta",
          TIPO_FALTA: tipoFalta,
          NOTAS: null,
          ID_PROFESOR: sesion.ID_PROFESOR || null,
          ID_ESPECIALIDAD: resolveAlumnoEspecialidadId(sesion) || null,
          FECHA_EXACTA: toDateInputValue(sesion.FECHA_EXACTA) || null,
          HORA_INICIO: toTimeInputValue(sesion.HORA_INICIO) || null,
          HORA_FIN: toTimeInputValue(sesion.HORA_FIN) || null,
          ESTADO_CONSULTA: null,
          ID_MATRICULA: sesion.ID_MATRICULA || null,
          ID_HORARIO: sesion.ID_HORARIO || null,
          ID_SESION: sesion.ID_SESION || null,
          ID_AULA: sesion.ID_AULA || null,
        });
      }
      toast.success(
        alumnosToSave.length === 1
          ? "Falta registrada con éxito"
          : `${alumnosToSave.length} faltas registradas con éxito`,
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar faltas");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            <span className="min-w-0">
              {group?.NOMBRE_GRUPO ?? "Pasar lista"}
              {franja ? (
                <span className="block text-sm font-normal text-muted-foreground">
                  {formatFranjaLabel(franja)}
                </span>
              ) : null}
            </span>
          </DialogTitle>
        </DialogHeader>

        {group ? (
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
            {sessionsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : !hasSessionsToday ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Hoy no hay clase en este horario.
              </p>
            ) : (
              <>
                {sessionSlots.length > 1 ? (
                  <div className="space-y-2">
                    <Label htmlFor="pasar-lista-sesion">Sesión de hoy</Label>
                    <Select value={selectedSlotKey} onValueChange={setSelectedSlotKey}>
                      <SelectTrigger id="pasar-lista-sesion">
                        <SelectValue placeholder="Seleccionar franja horaria" />
                      </SelectTrigger>
                      <SelectContent>
                        {sessionSlots.map((slot) => (
                          <SelectItem key={slot.key} value={slot.key}>
                            {formatHora(slot.horaInicio)} - {formatHora(slot.horaFin)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="pasar-lista-tipo-falta">Tipo de falta</Label>
                  <Select
                    value={tipoFalta}
                    onValueChange={(value) => setTipoFalta(value as TipoFalta)}
                  >
                    <SelectTrigger id="pasar-lista-tipo-falta">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPO_FALTA_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col min-h-0 border rounded-md">
                  <div className="px-3 py-2 border-b bg-muted/30">
                    <h3 className="text-sm font-semibold">Alumnos</h3>
                    <p className="text-xs text-muted-foreground">
                      Marca la falta de quien no haya asistido
                    </p>
                  </div>
                  <ul className="max-h-[40vh] overflow-y-auto p-2 space-y-0.5">
                    {enrolledAlumnos.length === 0 ? (
                      <li className="py-8 text-center text-sm text-muted-foreground">
                        No hay alumnos en este grupo.
                      </li>
                    ) : (
                      enrolledAlumnos.map((alumno) => {
                        const sesion = sesionByAlumnoId.get(alumno.id);
                        const alreadyMarked =
                          sesion && existingFaltaKeys.has(`${alumno.id}|${sesion.ID_SESION}`);
                        const noSession = !sesion;

                        return (
                          <li
                            key={alumno.id}
                            className="flex items-center gap-3 rounded-md px-2 py-2"
                          >
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                {initialsFromName(alumno.nombre)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {alumno.nombre}
                            </span>
                            {alreadyMarked ? (
                              <Badge variant="secondary" className="shrink-0 text-xs font-normal">
                                Ya marcada
                              </Badge>
                            ) : noSession ? (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                Sin sesión
                              </span>
                            ) : (
                              <Checkbox
                                checked={selectedAlumnoIds.has(alumno.id)}
                                onCheckedChange={(checked) =>
                                  toggleAlumno(alumno.id, checked === true)
                                }
                                aria-label={`Marcar falta de ${alumno.nombre}`}
                              />
                            )}
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              </>
            )}
          </div>
        ) : null}

        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            type="button"
            disabled={
              sessionsLoading ||
              !hasSessionsToday ||
              !selectedSlotKey ||
              create.isPending ||
              selectedAlumnoIds.size === 0
            }
            onClick={() => void handleSave()}
          >
            {create.isPending ? "Guardando..." : "Guardar faltas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeacherGrupoDetailDialog({
  group,
  alumnoNombreById,
  open,
  onClose,
}: {
  group: GrupoData | null;
  alumnoNombreById: Map<string, string>;
  open: boolean;
  onClose: () => void;
}) {
  const enrolledAlumnos = useMemo(() => {
    if (!group) return [];
    return group.ID_ALUMNOS.map((id) => ({
      id,
      nombre: alumnoNombreById.get(id) ?? "—",
    }))
      .filter((a) => a.nombre !== "—")
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  }, [group, alumnoNombreById]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            {group?.NOMBRE_GRUPO ?? "Grupo"}
          </DialogTitle>
        </DialogHeader>

        {group ? (
          <div className="overflow-y-auto flex-1 min-h-0">
            <ul className="max-h-[60vh] overflow-y-auto space-y-0.5">
              {enrolledAlumnos.length === 0 ? (
                <li className="py-8 text-center text-sm text-muted-foreground">
                  No hay alumnos en este grupo.
                </li>
              ) : (
                enrolledAlumnos.map((alumno) => (
                  <li key={alumno.id} className="flex items-center gap-3 rounded-md px-2 py-2">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {initialsFromName(alumno.nombre)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-medium">{alumno.nombre}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeacherGruposDashboard({ initialGrupoId }: { initialGrupoId?: string }) {
  const navigate = useNavigate();
  const { rol, perfil } = useActiveTenant();
  const [selectedGrupo, setSelectedGrupo] = useState<GrupoData | null>(null);
  const [pasarListaTarget, setPasarListaTarget] = useState<PasarListaTarget | null>(null);

  const { list } = useGrupos();
  const grupos = useMemo(() => list.data?.grupos ?? [], [list.data?.grupos]);
  const canViewPage = canViewGruposNav(rol, grupos, perfil.ID_PROFESOR);

  const alumnoNombreById = useMemo(() => {
    const map = new Map<string, string>();
    for (const alumno of list.data?.diccionarioAlumnos ?? []) {
      map.set(alumno.ID_ALUMNO, alumno.NOMBRE_ALUMNO);
    }
    return map;
  }, [list.data?.diccionarioAlumnos]);

  const franjaCards = useMemo(
    () =>
      buildFranjaCards(
        grupos.filter((g) => isGrupoEstadoActivo(g.ESTADO)),
        perfil.ID_PROFESOR,
      ),
    [grupos, perfil.ID_PROFESOR],
  );

  const openGroup = (group: GrupoData) => {
    setSelectedGrupo(group);
    navigate({
      to: "/app/grupos",
      search: { grupoId: group.ID_GRUPO },
      replace: true,
    });
  };

  const closeGroup = () => {
    setSelectedGrupo(null);
    navigate({
      to: "/app/grupos",
      search: { grupoId: undefined },
      replace: true,
    });
  };

  const openPasarLista = (target: PasarListaTarget) => {
    setPasarListaTarget(target);
  };

  const closePasarLista = () => {
    setPasarListaTarget(null);
  };

  useEffect(() => {
    if (!initialGrupoId || grupos.length === 0) return;
    const target = grupos.find((g) => g.ID_GRUPO === initialGrupoId);
    if (target) setSelectedGrupo(target);
  }, [initialGrupoId, grupos]);

  if (!list.isLoading && !canViewPage) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        No tienes grupos asignados. Consulta tu calendario de sesiones para ver tus clases.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {list.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar grupos: {(list.error as Error)?.message}
        </div>
      )}

      {list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : franjaCards.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No tienes grupos activos asignados.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {franjaCards.map(({ key, group, horario }) => (
            <FranjaCard
              key={key}
              group={group}
              horario={horario}
              onSelect={() => openGroup(group)}
              onPasarLista={() => openPasarLista({ group, horario })}
            />
          ))}
        </div>
      )}

      <TeacherGrupoDetailDialog
        group={selectedGrupo}
        alumnoNombreById={alumnoNombreById}
        open={!!selectedGrupo}
        onClose={closeGroup}
      />

      <PasarListaDialog
        target={pasarListaTarget}
        open={!!pasarListaTarget}
        onClose={closePasarLista}
        alumnoNombreById={alumnoNombreById}
        especialidades={list.data?.diccionarioEspecialidades ?? []}
        profesorId={perfil.ID_PROFESOR}
      />
    </div>
  );
}
