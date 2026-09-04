import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import {
  useIncidencias,
  type IncidenciaData,
  type IncidenciaUpdateInput,
} from "@/hooks/useIncidencias";
import { useActiveTenant } from "@/context/AppContext";
import { canWriteUi } from "@/lib/rbac";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type IncidenciaTab = "faltas" | "recuperaciones" | "consultas";

const TIPO_INCIDENCIA_OPTIONS = ["Consulta", "Falta", "Recuperación"] as const;
const TIPO_FALTA_OPTIONS = ["Recuperable", "No recuperable"] as const;
const ESTADO_CONSULTA_OPTIONS = ["Pendiente", "Resuelto", "Justificada"] as const;
const CONSULTA_SIN_ESPECIALIDAD = "__none__";

type TipoIncidencia = (typeof TIPO_INCIDENCIA_OPTIONS)[number];

type AlumnoOption = { id: string; nombre: string };
type EspecialidadOption = { ID_ESPECIALIDAD: string; ESPECIALIDAD: string };
type AulaOption = { ID_AULA: string; NOMBRE_AULA: string };

type SesionOption = {
  ID_SESION: string;
  FECHA_EXACTA: string;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ID_PROFESOR: string | null;
  ESPECIALIDAD: string | null;
  ID_MATRICULA: string | null;
  ID_HORARIO: string | null;
  ID_AULA: string | null;
};

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return "";
}

function toTimeInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

function formatHorarioRange(
  horaInicio: string | null | undefined,
  horaFin: string | null | undefined,
): string | null {
  const inicio = horaInicio?.trim().slice(0, 5);
  const fin = horaFin?.trim().slice(0, 5);
  if (inicio && fin) return `${inicio} – ${fin}`;
  if (inicio) return inicio;
  if (fin) return fin;
  return null;
}

function incidenciaTipoBadgeStatus(
  tipo: string | null | undefined,
): "destructive" | "success" | "info" | "neutral" {
  if (tipo === "Falta") return "destructive";
  if (tipo === "Recuperación") return "success";
  if (tipo === "Consulta") return "info";
  return "neutral";
}

function formatFecha(value: string | null | undefined): string {
  return value?.trim().slice(0, 10) || "—";
}

function normalizeRpcAlumnoIds(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        const id = row.ID_ALUMNO ?? row.id_alumno ?? row.id;
        return typeof id === "string" ? id.trim() : "";
      }
      return "";
    })
    .filter(Boolean);
}

function normalizeRpcEspecialidades(data: unknown): EspecialidadOption[] {
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  return data
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        ID_ESPECIALIDAD: String(record.ID_ESPECIALIDAD ?? record.id_especialidad ?? ""),
        ESPECIALIDAD: String(record.ESPECIALIDAD ?? record.especialidad ?? record.NOMBRE ?? "—"),
      };
    })
    .filter((item) => item.ID_ESPECIALIDAD && !seen.has(item.ID_ESPECIALIDAD) && seen.add(item.ID_ESPECIALIDAD));
}

function buildAlumnoOptions(
  allowedIds: string[],
  nombreById: Map<string, string>,
): AlumnoOption[] {
  return allowedIds
    .map((id) => ({ id, nombre: nombreById.get(id) ?? "" }))
    .filter((item) => item.nombre.trim())
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
}

function IncidenciaCard({ row, onOpen }: { row: IncidenciaData; onOpen: () => void }) {
  const alumno = row.ALUMNOS?.NOMBRE_ALUMNO?.trim() || "—";
  const horario = formatHorarioRange(row.HORA_INICIO, row.HORA_FIN);
  const fecha =
    row.TIPO_INCIDENCIA === "Consulta"
      ? formatFecha(row.FECHA_CREACION)
      : formatFecha(row.FECHA_EXACTA);

  return (
    <Card
      className="cursor-pointer p-4 transition-colors hover:bg-muted/40"
      onClick={onOpen}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate font-medium leading-snug">{alumno}</p>
        <StatusBadge status={incidenciaTipoBadgeStatus(row.TIPO_INCIDENCIA)} className="shrink-0">
          {row.TIPO_INCIDENCIA ?? "—"}
        </StatusBadge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {row.ESPECIALIDADES?.ESPECIALIDAD ?? row.TIPO_FALTA ?? row.ESTADO_CONSULTA ?? "—"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {fecha}
        </span>
        {horario ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {horario}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function IncidenciaDetailDialog({
  incidencia,
  open,
  canWrite,
  onClose,
  onEdit,
}: {
  incidencia: IncidenciaData | null;
  open: boolean;
  canWrite: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  if (!incidencia) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{incidencia.TIPO_INCIDENCIA ?? "Incidencia"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <StatusBadge status={incidenciaTipoBadgeStatus(incidencia.TIPO_INCIDENCIA)}>
            {incidencia.TIPO_INCIDENCIA ?? "—"}
          </StatusBadge>

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Alumno" value={incidencia.ALUMNOS?.NOMBRE_ALUMNO ?? "—"} />
            <DetailField
              label="Especialidad"
              value={incidencia.ESPECIALIDADES?.ESPECIALIDAD ?? "—"}
            />
            <DetailField label="Fecha" value={formatFecha(incidencia.FECHA_EXACTA)} />
            <DetailField
              label="Horario"
              value={formatHorarioRange(incidencia.HORA_INICIO, incidencia.HORA_FIN) ?? "—"}
            />
            {incidencia.TIPO_INCIDENCIA === "Falta" ? (
              <DetailField label="Tipo de falta" value={incidencia.TIPO_FALTA ?? "—"} />
            ) : null}
            {incidencia.TIPO_INCIDENCIA === "Consulta" ? (
              <DetailField label="Estado" value={incidencia.ESTADO_CONSULTA ?? "Pendiente"} />
            ) : null}
          </div>

          <DetailField label="Notas" value={incidencia.NOTAS?.trim() || "—"} />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          {canWrite ? (
            <Button type="button" variant="brand" onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeacherIncidenciaFormDialog({
  open,
  onClose,
  initial,
  rosterAlumnos,
  allowedAlumnoIds,
  profesorId,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  initial?: IncidenciaData | null;
  rosterAlumnos: AlumnoOption[];
  allowedAlumnoIds: Set<string>;
  profesorId: string | null | undefined;
  submitting: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const { tenantId, rol, centerId } = useActiveTenant();
  const isEditing = Boolean(initial?.ID_INCIDENCIA);

  const [tipoIncidencia, setTipoIncidencia] = useState<TipoIncidencia>("Falta");
  const [idAlumno, setIdAlumno] = useState("");
  const [idSesion, setIdSesion] = useState("");
  const [tipoFalta, setTipoFalta] = useState<string>(TIPO_FALTA_OPTIONS[0]);
  const [idEspecialidad, setIdEspecialidad] = useState("");
  const [idProfesor, setIdProfesor] = useState("");
  const [idAula, setIdAula] = useState("");
  const [fechaExacta, setFechaExacta] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [estadoConsulta, setEstadoConsulta] = useState<string>(ESTADO_CONSULTA_OPTIONS[0]);
  const [notas, setNotas] = useState("");

  const isConsulta = tipoIncidencia === "Consulta";
  const isFalta = tipoIncidencia === "Falta";
  const isRecuperacion = tipoIncidencia === "Recuperación";

  useEffect(() => {
    if (!open) return;
    setTipoIncidencia((initial?.TIPO_INCIDENCIA as TipoIncidencia) ?? "Falta");
    setIdAlumno(initial?.ID_ALUMNO ?? "");
    setIdSesion(initial?.ID_SESION ?? "");
    setTipoFalta(initial?.TIPO_FALTA ?? TIPO_FALTA_OPTIONS[0]);
    setIdEspecialidad(initial?.ID_ESPECIALIDAD ?? "");
    setIdProfesor(initial?.ID_PROFESOR ?? profesorId ?? "");
    setIdAula(initial?.ID_AULA ?? "");
    setFechaExacta(toDateInputValue(initial?.FECHA_EXACTA));
    setHoraInicio(toTimeInputValue(initial?.HORA_INICIO));
    setHoraFin(toTimeInputValue(initial?.HORA_FIN));
    setEstadoConsulta(initial?.ESTADO_CONSULTA ?? ESTADO_CONSULTA_OPTIONS[0]);
    setNotas(initial?.NOTAS ?? "");
  }, [open, initial, profesorId]);

  const recuperacionAlumnosQuery = useQuery({
    queryKey: ["teacher-incidencias-rec-alumnos", tenantId ?? "", profesorId ?? ""],
    enabled: open && isRecuperacion && !!profesorId?.trim(),
    queryFn: async () => {
      let query = supabase
        .from("HORARIOS_MATRICULAS")
        .select("ID_ALUMNO, SALDO")
        .eq("ESTADO", "Activo")
        .eq("ID_PROFESOR", profesorId!.trim())
        .gt("SALDO", 0);
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as { ID_ALUMNO: string | null; SALDO: number | null }[];
    },
  });

  const recuperacionEligibleAlumnoIds = useMemo(
    () =>
      new Set(
        (recuperacionAlumnosQuery.data ?? [])
          .map((row) => row.ID_ALUMNO?.trim())
          .filter(Boolean) as string[],
      ),
    [recuperacionAlumnosQuery.data],
  );

  const activeAlumnos = useMemo(() => {
    if (!isRecuperacion || isEditing) return rosterAlumnos;
    return rosterAlumnos.filter((a) => recuperacionEligibleAlumnoIds.has(a.id));
  }, [isRecuperacion, isEditing, rosterAlumnos, recuperacionEligibleAlumnoIds]);

  const recuperacionSaldoReady =
    isRecuperacion && !!idAlumno.trim() && !recuperacionAlumnosQuery.isLoading;
  const hasZeroSaldoRecuperaciones =
    recuperacionSaldoReady &&
    recuperacionAlumnosQuery.isFetched &&
    !recuperacionEligibleAlumnoIds.has(idAlumno.trim());

  const sesionesQuery = useQuery({
    queryKey: ["teacher-incidencias-sesiones", idAlumno, profesorId ?? ""],
    enabled: open && isFalta && !!idAlumno.trim(),
    queryFn: async () => {
      let query = supabase
        .from("SESIONES")
        .select(
          "ID_SESION, FECHA_EXACTA, HORA_INICIO, HORA_FIN, ID_PROFESOR, ESPECIALIDAD, ID_MATRICULA, ID_HORARIO, ID_AULA",
        )
        .eq("ID_ALUMNO", idAlumno.trim())
        .order("FECHA_EXACTA", { ascending: false })
        .order("HORA_INICIO", { ascending: true });
      if (profesorId?.trim()) {
        query = query.eq("ID_PROFESOR", profesorId.trim());
      }
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SesionOption[];
    },
  });

  const recuperacionEspQuery = useQuery({
    queryKey: ["teacher-incidencias-rec-esp", idAlumno],
    enabled: open && isRecuperacion && !!idAlumno.trim(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_especialidades_alumno_recuperacion", {
        p_id_alumno: idAlumno.trim(),
      });
      if (error) throw error;
      return normalizeRpcEspecialidades(data);
    },
  });

  const consultaEspecialidadesQuery = useQuery({
    queryKey: ["teacher-incidencias-consulta-esp", tenantId ?? "", idAlumno, profesorId ?? ""],
    enabled: open && isConsulta && !!idAlumno.trim() && !!profesorId?.trim(),
    queryFn: async () => {
      let horariosQuery = supabase
        .from("HORARIOS_MATRICULAS")
        .select("ID_ESPECIALIDAD")
        .eq("ID_ALUMNO", idAlumno.trim())
        .eq("ESTADO", "Activo")
        .eq("ID_PROFESOR", profesorId!.trim())
        .not("ID_ESPECIALIDAD", "is", null);
      horariosQuery = scopeTenantQuery(horariosQuery, rol, tenantId);
      const { data: horarios, error } = await horariosQuery;
      if (error) throw error;

      const espIds = [
        ...new Set(
          (horarios ?? [])
            .map((row) => (row as { ID_ESPECIALIDAD: string | null }).ID_ESPECIALIDAD?.trim())
            .filter(Boolean) as string[],
        ),
      ];
      if (espIds.length === 0) return [] as EspecialidadOption[];

      let espQuery = supabase.from("ESPECIALIDADES").select("ID_ESPECIALIDAD, ESPECIALIDAD");
      espQuery = scopeTenantQuery(espQuery, rol, tenantId);
      espQuery = espQuery.in("ID_ESPECIALIDAD", espIds);
      const { data: especialidades, error: espError } = await espQuery;
      if (espError) throw espError;
      return (especialidades ?? []) as EspecialidadOption[];
    },
  });

  const aulasQuery = useQuery({
    queryKey: ["teacher-incidencias-aulas", tenantId ?? ""],
    enabled: open && isRecuperacion,
    queryFn: async () => {
      let query = supabase.from("AULA").select("ID_AULA, NOMBRE_AULA");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AulaOption[];
    },
  });

  const selectedSesion = useMemo(
    () => (sesionesQuery.data ?? []).find((s) => s.ID_SESION === idSesion) ?? null,
    [sesionesQuery.data, idSesion],
  );

  useEffect(() => {
    if (!selectedSesion) return;
    setFechaExacta(toDateInputValue(selectedSesion.FECHA_EXACTA));
    setHoraInicio(toTimeInputValue(selectedSesion.HORA_INICIO));
    setHoraFin(toTimeInputValue(selectedSesion.HORA_FIN));
    setIdProfesor(selectedSesion.ID_PROFESOR ?? profesorId ?? "");
  }, [selectedSesion, profesorId]);

  const handleSubmit = async () => {
    if (!idAlumno.trim()) {
      toast.error("Selecciona un alumno.");
      return;
    }
    if (!isEditing && !allowedAlumnoIds.has(idAlumno.trim())) {
      toast.error("No tienes permiso para registrar incidencias de este alumno.");
      return;
    }
    if (isFalta && !idSesion.trim()) {
      toast.error("Selecciona la sesión a la que corresponde la falta.");
      return;
    }
    if (isFalta && !tipoFalta.trim()) {
      toast.error("Selecciona el tipo de falta.");
      return;
    }
    if (isRecuperacion) {
      if (hasZeroSaldoRecuperaciones) {
        toast.error("Este alumno no tiene recuperaciones pendientes.");
        return;
      }
      if (!idEspecialidad.trim()) {
        toast.error("Selecciona una especialidad.");
        return;
      }
      if (!isEditing && !profesorId?.trim()) {
        toast.error("Tu perfil no tiene un profesor asociado.");
        return;
      }
      if (!fechaExacta.trim() || !horaInicio.trim() || !horaFin.trim()) {
        toast.error("Indica fecha y horario de la recuperación.");
        return;
      }
    }

    const payload: Record<string, unknown> = {
      ID_ALUMNO: idAlumno.trim(),
      TIPO_INCIDENCIA: tipoIncidencia,
      NOTAS: notas.trim() || null,
      ID_PROFESOR: isRecuperacion && !isEditing ? profesorId!.trim() : idProfesor.trim() || profesorId || null,
      ID_ESPECIALIDAD: idEspecialidad.trim() || null,
      FECHA_EXACTA: null,
      HORA_INICIO: null,
      HORA_FIN: null,
      TIPO_FALTA: null,
      ESTADO_CONSULTA: null,
      ID_MATRICULA: null,
      ID_HORARIO: null,
      ID_SESION: null,
      ID_AULA: null,
    };

    if (isConsulta) {
      payload.ESTADO_CONSULTA = estadoConsulta;
    } else if (isFalta) {
      payload.TIPO_FALTA = tipoFalta;
      payload.FECHA_EXACTA = fechaExacta || null;
      payload.HORA_INICIO = horaInicio || null;
      payload.HORA_FIN = horaFin || null;
      payload.ID_SESION = selectedSesion?.ID_SESION ?? initial?.ID_SESION ?? null;
      payload.ID_MATRICULA = selectedSesion?.ID_MATRICULA ?? initial?.ID_MATRICULA ?? null;
      payload.ID_HORARIO = selectedSesion?.ID_HORARIO ?? initial?.ID_HORARIO ?? null;
      payload.ID_AULA = selectedSesion?.ID_AULA ?? initial?.ID_AULA ?? null;
    } else if (isRecuperacion) {
      payload.FECHA_EXACTA = fechaExacta || null;
      payload.HORA_INICIO = horaInicio || null;
      payload.HORA_FIN = horaFin || null;
      payload.ID_AULA = idAula.trim() || null;
    }

    if (!isEditing) {
      payload.ID_CENTRO = centerId ?? null;
    }

    await onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar incidencia" : "Nueva incidencia"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!isEditing ? (
            <div className="space-y-2">
              <Label>Tipo de incidencia</Label>
              <Select
                value={tipoIncidencia}
                onValueChange={(value) => {
                  setTipoIncidencia(value as TipoIncidencia);
                  setIdAlumno("");
                  setIdSesion("");
                  setIdEspecialidad("");
                  setIdProfesor(profesorId ?? "");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_INCIDENCIA_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Alumno</Label>
            <Select
              value={idAlumno || undefined}
              onValueChange={(value) => {
                setIdAlumno(value);
                setIdSesion("");
                setIdEspecialidad("");
              }}
              disabled={isEditing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar alumno" />
              </SelectTrigger>
              <SelectContent>
                {activeAlumnos.length === 0 ? (
                  <SelectItem value="__empty__" disabled>
                    {isRecuperacion
                      ? "No hay alumnos con recuperaciones pendientes"
                      : "No hay alumnos disponibles"}
                  </SelectItem>
                ) : (
                  activeAlumnos.map((alumno) => (
                    <SelectItem key={alumno.id} value={alumno.id}>
                      {alumno.nombre}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {isRecuperacion && idAlumno && hasZeroSaldoRecuperaciones ? (
            <div
              role="alert"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              Este alumno no tiene recuperaciones pendientes.
            </div>
          ) : null}

          {isFalta ? (
            <div className="space-y-2">
              <Label>Sesión</Label>
              <Select value={idSesion || undefined} onValueChange={setIdSesion} disabled={!idAlumno}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar sesión" />
                </SelectTrigger>
                <SelectContent>
                  {sesionesQuery.isLoading ? (
                    <SelectItem value="__loading__" disabled>
                      Cargando sesiones...
                    </SelectItem>
                  ) : (sesionesQuery.data ?? []).length === 0 ? (
                    <SelectItem value="__empty__" disabled>
                      No hay sesiones para este alumno
                    </SelectItem>
                  ) : (
                    (sesionesQuery.data ?? []).map((sesion) => (
                      <SelectItem key={sesion.ID_SESION} value={sesion.ID_SESION}>
                        {formatFecha(sesion.FECHA_EXACTA)} ·{" "}
                        {formatHorarioRange(sesion.HORA_INICIO, sesion.HORA_FIN) ?? "—"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {isFalta ? (
            <div className="space-y-2">
              <Label>Tipo de falta</Label>
              <Select value={tipoFalta} onValueChange={setTipoFalta}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_FALTA_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {isRecuperacion ? (
            <>
              <div className="space-y-2">
                <Label>Especialidad</Label>
                <Select
                  value={idEspecialidad || undefined}
                  onValueChange={setIdEspecialidad}
                  disabled={!idAlumno}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar especialidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {(recuperacionEspQuery.data ?? []).map((esp) => (
                      <SelectItem key={esp.ID_ESPECIALIDAD} value={esp.ID_ESPECIALIDAD}>
                        {esp.ESPECIALIDAD}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fecha</Label>
                  <Input type="date" value={fechaExacta} onChange={(e) => setFechaExacta(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Aula</Label>
                  <Select value={idAula || undefined} onValueChange={setIdAula}>
                    <SelectTrigger>
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      {(aulasQuery.data ?? []).map((aula) => (
                        <SelectItem key={aula.ID_AULA} value={aula.ID_AULA}>
                          {aula.NOMBRE_AULA}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Hora inicio</Label>
                  <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hora fin</Label>
                  <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
                </div>
              </div>
            </>
          ) : null}

          {isConsulta ? (
            <>
              <div className="space-y-2">
                <Label>Especialidad (opcional)</Label>
                <Select
                  value={
                    idEspecialidad.trim()
                      ? idEspecialidad
                      : CONSULTA_SIN_ESPECIALIDAD
                  }
                  onValueChange={(value) =>
                    setIdEspecialidad(value === CONSULTA_SIN_ESPECIALIDAD ? "" : value)
                  }
                  disabled={!idAlumno.trim() || consultaEspecialidadesQuery.isLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !idAlumno.trim()
                          ? "Selecciona un alumno primero"
                          : consultaEspecialidadesQuery.isLoading
                            ? "Cargando especialidades..."
                            : "Sin especialidad"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {!idAlumno.trim() ? (
                      <SelectItem value="__select_alumno__" disabled>
                        Selecciona un alumno primero
                      </SelectItem>
                    ) : consultaEspecialidadesQuery.isLoading ? (
                      <SelectItem value="__loading__" disabled>
                        Cargando especialidades...
                      </SelectItem>
                    ) : (
                      <>
                        <SelectItem value={CONSULTA_SIN_ESPECIALIDAD}>
                          Sin especialidad
                        </SelectItem>
                        {(consultaEspecialidadesQuery.data ?? []).map((esp) => (
                          <SelectItem key={esp.ID_ESPECIALIDAD} value={esp.ID_ESPECIALIDAD}>
                            {esp.ESPECIALIDAD}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado de consulta</Label>
                <Select value={estadoConsulta} onValueChange={setEstadoConsulta}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADO_CONSULTA_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="brand"
            disabled={
              submitting || (!isEditing && isRecuperacion && hasZeroSaldoRecuperaciones)
            }
            onClick={() => void handleSubmit()}
          >
            {submitting ? "Guardando..." : isEditing ? "Guardar cambios" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeacherIncidenciasDashboard() {
  const { rol, perfil, tenantId } = useActiveTenant();
  const canWrite = canWriteUi(rol, "incidencias:write");
  const { list, create, update } = useIncidencias();
  const profesorId = perfil.ID_PROFESOR;

  const alumnosPorProfesorQuery = useQuery({
    queryKey: [
      ...tenantListKey("teacherIncidenciasAlumnosRpc", rol, tenantId),
      profesorId ?? "none",
    ],
    enabled: !!profesorId?.trim(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("obtener_id_alumnos_por_profesor", {
        p_id_profesor: profesorId!.trim(),
      });
      if (error) throw error;
      return normalizeRpcAlumnoIds(data);
    },
  });

  const alumnosPorSesionesQuery = useQuery({
    queryKey: [
      ...tenantListKey("teacherIncidenciasAlumnosSesiones", rol, tenantId),
      profesorId ?? "none",
    ],
    enabled: !!profesorId?.trim(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("SESIONES")
        .select("ID_ALUMNO")
        .eq("ID_PROFESOR", profesorId!.trim())
        .not("ID_ALUMNO", "is", null);
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query;
      if (error) throw error;
      const ids = new Set<string>();
      for (const row of data ?? []) {
        const id = (row as { ID_ALUMNO: string | null }).ID_ALUMNO?.trim();
        if (id) ids.add(id);
      }
      return [...ids];
    },
  });

  const allowedAlumnoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of alumnosPorProfesorQuery.data ?? []) ids.add(id);
    for (const id of alumnosPorSesionesQuery.data ?? []) ids.add(id);
    return ids;
  }, [alumnosPorProfesorQuery.data, alumnosPorSesionesQuery.data]);

  const alumnosNombresList = useQuery({
    queryKey: [
      ...tenantListKey("teacherIncidenciasAlumnosNombres", rol, tenantId),
      profesorId ?? "none",
      alumnosPorProfesorQuery.data ?? [],
      alumnosPorSesionesQuery.data ?? [],
    ],
    enabled: allowedAlumnoIds.size > 0,
    queryFn: async () => {
      let query = supabase.from("ALUMNOS").select("ID_ALUMNO, NOMBRE_ALUMNO");
      query = scopeTenantQuery(query, rol, tenantId);
      query = query.in("ID_ALUMNO", [...allowedAlumnoIds]);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as { ID_ALUMNO: string; NOMBRE_ALUMNO: string }[];
    },
  });

  const rosterAlumnos = useMemo(() => {
    const nombreById = new Map(
      (alumnosNombresList.data ?? []).map((a) => [a.ID_ALUMNO, a.NOMBRE_ALUMNO]),
    );
    return buildAlumnoOptions([...allowedAlumnoIds], nombreById);
  }, [allowedAlumnoIds, alumnosNombresList.data]);

  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<IncidenciaTab>("faltas");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingIncidencia, setEditingIncidencia] = useState<IncidenciaData | null>(null);

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (inc) =>
        inc.ALUMNOS?.NOMBRE_ALUMNO?.toLowerCase().includes(q) ||
        inc.TIPO_INCIDENCIA?.toLowerCase().includes(q) ||
        inc.TIPO_FALTA?.toLowerCase().includes(q) ||
        inc.ESTADO_CONSULTA?.toLowerCase().includes(q) ||
        inc.NOTAS?.toLowerCase().includes(q) ||
        inc.ESPECIALIDADES?.ESPECIALIDAD?.toLowerCase().includes(q),
    );
  }, [list.data, query]);

  const { faltasRows, recuperacionesRows, consultasRows } = useMemo(() => {
    const sortByFecha = (a: IncidenciaData, b: IncidenciaData) =>
      (b.FECHA_EXACTA || b.FECHA_CREACION || "").localeCompare(
        a.FECHA_EXACTA || a.FECHA_CREACION || "",
      );
    return {
      faltasRows: filtered.filter((inc) => inc.TIPO_INCIDENCIA === "Falta").sort(sortByFecha),
      recuperacionesRows: filtered
        .filter((inc) => inc.TIPO_INCIDENCIA === "Recuperación")
        .sort(sortByFecha),
      consultasRows: filtered.filter((inc) => inc.TIPO_INCIDENCIA === "Consulta").sort(sortByFecha),
    };
  }, [filtered]);

  const renderRows = (rows: IncidenciaData[]) => {
    if (list.isLoading) {
      return Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />);
    }
    if (rows.length === 0) {
      return (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {query ? "Sin resultados." : "No hay incidencias en esta pestaña."}
        </Card>
      );
    }
    return rows.map((row) => (
      <IncidenciaCard
        key={row.ID_INCIDENCIA}
        row={row}
        onOpen={() => setSelectedId(row.ID_INCIDENCIA)}
      />
    ));
  };

  const selectedIncidencia = useMemo(
    () => (list.data ?? []).find((inc) => inc.ID_INCIDENCIA === selectedId) ?? null,
    [list.data, selectedId],
  );

  const handleCreate = async (payload: Record<string, unknown>) => {
    const alumnoId = String(payload.ID_ALUMNO ?? "").trim();
    if (!allowedAlumnoIds.has(alumnoId)) {
      toast.error("No tienes permiso para registrar incidencias de este alumno.");
      return;
    }
    try {
      await create.mutateAsync(payload);
      toast.success("Incidencia registrada con éxito");
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar");
    }
  };

  const handleUpdate = async (payload: Record<string, unknown>) => {
    if (!editingIncidencia?.ID_INCIDENCIA) return;
    try {
      await update.mutateAsync({
        id: editingIncidencia.ID_INCIDENCIA,
        patch: payload as IncidenciaUpdateInput,
      });
      toast.success("Incidencia actualizada correctamente");
      setEditingIncidencia(null);
      setSelectedId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por alumno, tipo o notas..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {canWrite ? (
          <Button
            variant="brand"
            className="shrink-0"
            onClick={() => {
              setEditingIncidencia(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva incidencia
          </Button>
        ) : null}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as IncidenciaTab)}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="faltas">Faltas ({faltasRows.length})</TabsTrigger>
          <TabsTrigger value="recuperaciones">
            Recuperaciones ({recuperacionesRows.length})
          </TabsTrigger>
          <TabsTrigger value="consultas">Consultas ({consultasRows.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="faltas" className="mt-4 space-y-3">
          {renderRows(faltasRows)}
        </TabsContent>
        <TabsContent value="recuperaciones" className="mt-4 space-y-3">
          {renderRows(recuperacionesRows)}
        </TabsContent>
        <TabsContent value="consultas" className="mt-4 space-y-3">
          {renderRows(consultasRows)}
        </TabsContent>
      </Tabs>

      {!list.isLoading && (list.data?.length ?? 0) > 0 ? (
        <p className="text-xs text-muted-foreground">
          {list.data?.length ?? 0} incidencias en total
        </p>
      ) : null}

      <IncidenciaDetailDialog
        incidencia={selectedIncidencia}
        open={!!selectedId && !editingIncidencia}
        canWrite={canWrite}
        onClose={() => setSelectedId(null)}
        onEdit={() => {
          if (selectedIncidencia) {
            setEditingIncidencia(selectedIncidencia);
          }
        }}
      />

      <TeacherIncidenciaFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        rosterAlumnos={rosterAlumnos}
        allowedAlumnoIds={allowedAlumnoIds}
        profesorId={profesorId}
        submitting={create.isPending}
        onSubmit={handleCreate}
      />

      <TeacherIncidenciaFormDialog
        open={!!editingIncidencia}
        onClose={() => setEditingIncidencia(null)}
        initial={editingIncidencia}
        rosterAlumnos={rosterAlumnos}
        allowedAlumnoIds={allowedAlumnoIds}
        profesorId={profesorId}
        submitting={update.isPending}
        onSubmit={handleUpdate}
      />
    </div>
  );
}
