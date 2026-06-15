import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Pencil, X } from "lucide-react";
import type {
  AlumnoTree,
  AlumnoUpdateInput,
  HorarioCreateInput,
  HorarioUpdateInput,
} from "@/hooks/useAlumnosTree";
import { useAlumnoMatriculasIncidencias } from "@/hooks/useAlumnoMatriculasIncidencias";
import type { GrupoHorarioSlot } from "@/hooks/useGruposHorarios";
import { AlumnoFormDialog } from "@/components/alumnos/AlumnoFormDialog";
import { calcEdad, type AlumnoFormValues } from "@/lib/alumnoSchema";
import {
  isBankRemittancePaymentMethod,
  isBizumPaymentMethod,
  normalizeMetodoPago,
} from "@/lib/alumnoPaymentUtils";
import { MESES_ANIO } from "@/lib/alumnosMatriculasUtils";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export const ALUMNO_OVERLAY_PANEL_CLASS =
  "fixed top-[20vh] left-1/2 -translate-x-1/2 w-full max-w-6xl max-h-[65vh] overflow-y-auto bg-white border border-gray-200 shadow-xl rounded-lg z-50";

const ESTADO_OPCIONES = ["Cobrar", "Pagado", "Devolver"] as const;
const MATRICULA_ESTADOS = ["Activo", "Inactivo"] as const;

function normalizeMatriculaEstado(estado: string | null | undefined): (typeof MATRICULA_ESTADOS)[number] {
  return estado?.trim().toLowerCase() === "inactivo" ? "Inactivo" : "Activo";
}

type LookupMaps = {
  profesorById: Map<string, string>;
  aulaById: Map<string, string>;
  tarifaById: Map<string, string>;
  especialidadById: Map<string, string>;
};

function ReadOnlyField({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-muted-foreground">{label}</Label>
      <p className="mt-1 text-sm font-medium">{value ?? "—"}</p>
    </div>
  );
}

function AuthBadge({ label, granted }: { label: string; granted: boolean | null | undefined }) {
  const ok = granted === true;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium",
        ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800",
      )}
    >
      {label}: {ok ? "Sí" : "No"}
    </span>
  );
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function formatMatriculaTarifa(
  mat: {
    ID_TARIFA?: string | null;
    TARIFAS?: { SERVICIO?: string | null } | null;
  },
  tarifaById: Map<string, string>,
): string {
  if (mat.TARIFAS?.SERVICIO?.trim()) return mat.TARIFAS.SERVICIO.trim();
  if (!mat.ID_TARIFA) return "Sin tarifa";
  return tarifaById.get(mat.ID_TARIFA) ?? "Sin tarifa";
}

function formatHorarioSchedule(
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

function buildTutorRows(alumno: AlumnoTree) {
  const rows: Array<{ label: string; nombre: string | null; telefono: string | null }> = [];
  if (alumno.NOMBRE_MADRE?.trim() || alumno.TLF_MADRE?.trim()) {
    rows.push({
      label: "Tutor A",
      nombre: alumno.NOMBRE_MADRE,
      telefono: alumno.TLF_MADRE,
    });
  }
  if (alumno.NOMBRE_PADRE?.trim() || alumno.TLF_PADRE?.trim()) {
    rows.push({
      label: "Tutor B",
      nombre: alumno.NOMBRE_PADRE,
      telefono: alumno.TLF_PADRE,
    });
  }
  return rows;
}

function EstadoField({
  label,
  value,
  showMes,
  mesValue,
  disabled,
  onEstadoChange,
  onMesChange,
}: {
  label: string;
  value: string | null | undefined;
  showMes: boolean;
  mesValue: string | null | undefined;
  disabled?: boolean;
  onEstadoChange: (value: string) => void;
  onMesChange: (value: string) => void;
}) {
  const current = value?.trim() ?? "";
  const estadoSelectValue = ESTADO_OPCIONES.includes(current as (typeof ESTADO_OPCIONES)[number])
    ? current
    : "__unset__";

  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={estadoSelectValue}
          disabled={disabled}
          onValueChange={(v) => onEstadoChange(v === "__unset__" ? "" : v)}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Seleccionar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__unset__">—</SelectItem>
            {ESTADO_OPCIONES.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showMes && (
          <Select
            value={mesValue?.trim() || "__unset__"}
            disabled={disabled}
            onValueChange={(v) => onMesChange(v === "__unset__" ? "" : v)}
          >
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Mes devolución" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unset__">Mes devolución</SelectItem>
              {MESES_ANIO.map((mes) => (
                <SelectItem key={mes} value={mes}>
                  {mes}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function MatriculasIncidenciasPanel({
  alumnoId,
  lookups,
}: {
  alumnoId: string;
  lookups: LookupMaps;
}) {
  const { data, isLoading, isError, error } = useAlumnoMatriculasIncidencias(alumnoId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-6 text-center text-sm text-destructive">
        {error instanceof Error ? error.message : "Error al cargar matrículas e incidencias."}
      </p>
    );
  }

  const matriculas = data?.matriculas ?? [];
  const incidencias = data?.incidencias ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold tracking-tight">Matrículas actuales</h3>
        {matriculas.length === 0 ? (
          <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            Este alumno no tiene matrículas registradas.
          </p>
        ) : (
          <div className="space-y-4">
            {matriculas.map((mat) => {
              const horarios = mat.HORARIOS_MATRICULAS ?? [];
              return (
                <div
                  key={mat.ID_MATRICULA}
                  className="overflow-hidden rounded-md border bg-muted/20 p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                      <p className="text-xs text-muted-foreground">Tarifa</p>
                      <p className="text-sm font-medium">
                        {formatMatriculaTarifa(mat, lookups.tarifaById)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Especialidad</p>
                      <p className="text-sm font-medium">
                        {mat.ESPECIALIDAD
                          ? lookups.especialidadById.get(mat.ESPECIALIDAD) ?? mat.ESPECIALIDAD
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Estado</p>
                      <Badge variant="secondary" className="mt-0.5">
                        {normalizeMatriculaEstado(mat.ESTADO)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Fecha alta</p>
                      <p className="text-sm font-medium">{mat.FECHA_ALTA ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Profesor</p>
                      <p className="text-sm font-medium">
                        {mat.ID_PROFESOR
                          ? lookups.profesorById.get(mat.ID_PROFESOR) ?? mat.ID_PROFESOR
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 border-t pt-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Horarios</p>
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
                              const especialidadId = horario.ID_ESPECIALIDAD ?? mat.ESPECIALIDAD;
                              return (
                                <TableRow key={horario.ID_HORARIO}>
                                  <TableCell>
                                    {especialidadId
                                      ? lookups.especialidadById.get(especialidadId) ?? especialidadId
                                      : "—"}
                                  </TableCell>
                                  <TableCell>
                                    {formatHorarioSchedule(
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
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold tracking-tight">Historial de incidencias</h3>
        {incidencias.length === 0 ? (
          <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            No hay incidencias registradas para este alumno.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Falta</TableHead>
                  <TableHead>Profesor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidencias.map((inc) => (
                  <TableRow key={inc.ID_INCIDENCIA}>
                    <TableCell className="whitespace-nowrap">{inc.FECHA_EXACTA ?? "—"}</TableCell>
                    <TableCell>{inc.TIPO_INCIDENCIA ?? "—"}</TableCell>
                    <TableCell>{inc.TIPO_FALTA ?? "—"}</TableCell>
                    <TableCell>
                      {inc.ID_PROFESOR
                        ? lookups.profesorById.get(inc.ID_PROFESOR) ?? inc.ID_PROFESOR
                        : "—"}
                    </TableCell>
                    <TableCell>{inc.ESTADO_CONSULTA ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={inc.NOTAS ?? undefined}>
                      {inc.NOTAS ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

type SelectOptions = {
  especialidades: Array<{ id: string; label: string }>;
  tarifas: Array<{ id: string; label: string }>;
  profesores: Array<{ id: string; label: string }>;
};

export function AlumnoDetailOverlay({
  alumno,
  open,
  mode = "detail",
  onClose,
  onEdit,
  onCancelEdit,
  onPatch,
  patching,
  lookups,
  selectOptions,
  tarifaSesionesById,
  grupoSlots,
  editSubmitting,
  onEditSubmit,
  onCreateHorario,
  onUpdateHorario,
  onRemoveHorario,
  horarioSaving,
}: {
  alumno: AlumnoTree | null;
  open: boolean;
  mode?: "detail" | "edit";
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onPatch: (patch: AlumnoUpdateInput) => Promise<void>;
  patching?: boolean;
  lookups: LookupMaps;
  selectOptions: SelectOptions;
  tarifaSesionesById: Map<string, number | null>;
  grupoSlots: GrupoHorarioSlot[];
  editSubmitting: boolean;
  onEditSubmit: (values: AlumnoFormValues) => void;
  onCreateHorario: (input: HorarioCreateInput) => Promise<void>;
  onUpdateHorario: (id: string, patch: HorarioUpdateInput) => Promise<void>;
  onRemoveHorario: (id: string) => Promise<void>;
  horarioSaving: boolean;
}) {
  const [activeTab, setActiveTab] = useState("resumen");
  const alumnoId = alumno?.ID_ALUMNO ?? null;

  useEffect(() => {
    if (!open) setActiveTab("resumen");
  }, [open]);

  useEffect(() => {
    setActiveTab("resumen");
  }, [alumnoId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "edit") onCancelEdit();
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, mode, onClose, onCancelEdit]);

  if (!open) return null;

  if (!alumno) {
    return createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/10"
          aria-label="Cerrar"
          onClick={onClose}
        />
        <div className={cn(ALUMNO_OVERLAY_PANEL_CLASS, "flex items-center justify-center p-6")}>
          <Skeleton className="h-8 w-48" />
        </div>
      </>,
      document.body,
    );
  }

  const edad = calcEdad(alumno.NACIMIENTO);
  const tutors = buildTutorRows(alumno);
  const metodoPago = normalizeMetodoPago(alumno.METODO_PAGO);
  const showMesMatricula = alumno.ESTADO_MATRICULA?.trim() === "Devolver";
  const showMesReserva = alumno.ESTADO_RESERVA?.trim() === "Devolver";

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/10"
        aria-label="Cerrar detalle del alumno"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alumno-overlay-title"
        className={cn(ALUMNO_OVERLAY_PANEL_CLASS, "p-6")}
      >
        {mode === "edit" ? (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={onCancelEdit}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver
                </Button>
                <h2 id="alumno-overlay-title" className="truncate text-xl font-semibold">
                  Editar alumno
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cerrar"
                onClick={onClose}
              >
                <X className="h-5 w-5" />
              </Button>
            </header>

            <AlumnoFormDialog
              open
              variant="embedded"
              title="Editar alumno"
              submitLabel="Guardar"
              initial={alumno}
              submitting={editSubmitting}
              lookups={lookups}
              selectOptions={selectOptions}
              tarifaSesionesById={tarifaSesionesById}
              grupoSlots={grupoSlots}
              horarioSaving={horarioSaving}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onClose={onCancelEdit}
              onSubmit={onEditSubmit}
              onCreateHorario={onCreateHorario}
              onUpdateHorario={onUpdateHorario}
              onRemoveHorario={onRemoveHorario}
            />
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <PersonAvatar
                  name={alumno.NOMBRE_ALUMNO}
                  photoUrl={alumno.FOTO}
                  className="h-12 w-12"
                />
                <h2 id="alumno-overlay-title" className="truncate text-xl font-semibold">
                  {alumno.NOMBRE_ALUMNO}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="gap-2 bg-black text-white hover:bg-black/90"
                  onClick={onEdit}
                >
                  <Pencil className="h-4 w-4" />
                  Editar Alumno
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Cerrar"
                  onClick={onClose}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-4">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="personales">Datos personales</TabsTrigger>
            <TabsTrigger value="pago">Datos de pago</TabsTrigger>
            <TabsTrigger value="matricula">Matrículas e Incidencias</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ReadOnlyField label="Nombre alumno" value={alumno.NOMBRE_ALUMNO} />
            <ReadOnlyField label="Tel. comunicación" value={alumno.TLF_COMUNICACION} />
            <ReadOnlyField label="Email" value={alumno.MAIL} />

            <EstadoField
              label="Estado matrícula"
              value={alumno.ESTADO_MATRICULA}
              showMes={showMesMatricula}
              mesValue={alumno.MES_DEVOLUCION_RESERVA}
              disabled={patching}
              onEstadoChange={(v) =>
                void onPatch({
                  ESTADO_MATRICULA: v || null,
                  ...(v !== "Devolver" && alumno.ESTADO_RESERVA?.trim() !== "Devolver"
                    ? { MES_DEVOLUCION_RESERVA: null }
                    : {}),
                })
              }
              onMesChange={(v) => void onPatch({ MES_DEVOLUCION_RESERVA: v || null })}
            />

            <EstadoField
              label="Estado reserva"
              value={alumno.ESTADO_RESERVA}
              showMes={showMesReserva}
              mesValue={alumno.MES_DEVOLUCION_RESERVA}
              disabled={patching}
              onEstadoChange={(v) =>
                void onPatch({
                  ESTADO_RESERVA: v || null,
                  ...(v !== "Devolver" && alumno.ESTADO_MATRICULA?.trim() !== "Devolver"
                    ? { MES_DEVOLUCION_RESERVA: null }
                    : {}),
                })
              }
              onMesChange={(v) => void onPatch({ MES_DEVOLUCION_RESERVA: v || null })}
            />

            <ReadOnlyField label="Total mensual (€)" value={formatCurrency(alumno.TOTAL_MENSUAL)} />

            {alumno.NOTAS?.trim() ? (
              <ReadOnlyField
                label="Notas"
                value={alumno.NOTAS}
                className="sm:col-span-2 lg:col-span-3"
              />
            ) : null}
          </TabsContent>

          <TabsContent value="personales" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ReadOnlyField label="DNI" value={alumno.DNI} />
              <ReadOnlyField label="Nacimiento" value={alumno.NACIMIENTO} />
              <ReadOnlyField label="Edad actual" value={edad || "—"} />
              {tutors.map((tutor) => (
                <div key={tutor.label} className="space-y-2 sm:col-span-2 lg:col-span-1">
                  {tutor.nombre?.trim() ? (
                    <ReadOnlyField label={`${tutor.label} — Nombre`} value={tutor.nombre} />
                  ) : null}
                  {tutor.telefono?.trim() ? (
                    <ReadOnlyField label={`${tutor.label} — Teléfono`} value={tutor.telefono} />
                  ) : null}
                </div>
              ))}
              <ReadOnlyField
                label="Dirección"
                value={alumno.DIRECCION}
                className="sm:col-span-2"
              />
              <ReadOnlyField label="CP" value={alumno.CP} />
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Autorizaciones legales</p>
              <div className="flex flex-wrap gap-2">
                <AuthBadge label="Medios" granted={alumno.AUT_MEDIOS} />
                <AuthBadge label="Instalaciones" granted={alumno.AUT_INSTALACIONES} />
                <AuthBadge label="Web" granted={alumno.AUT_WEB} />
                <AuthBadge label="RRSS" granted={alumno.AUT_RRSS} />
                <AuthBadge label="Comunicación total" granted={alumno.AUT_COMUNICACION_TOTAL} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pago" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Método de pago</Label>
              {metodoPago ? (
                <Badge variant="secondary" className="text-sm font-medium">
                  {metodoPago}
                </Badge>
              ) : (
                <p className="text-sm font-medium">—</p>
              )}
            </div>

            {isBankRemittancePaymentMethod(metodoPago) && (
              <>
                <ReadOnlyField label="IBAN" value={alumno.IBAN} />
                <ReadOnlyField label="Titular cuenta" value={alumno.TITULAR_CUENTA} />
                <ReadOnlyField label="Mandato" value={alumno.MANDATO} />
              </>
            )}

            {isBizumPaymentMethod(metodoPago) && (
              <ReadOnlyField label="Teléfono Bizum" value={alumno.TLF_BIZUM} />
            )}

            <ReadOnlyField label="Motivo ajuste" value={alumno.MOTIVO_AJUSTE} />
            <ReadOnlyField
              label="Dto. hermanos (%)"
              value={
                alumno.DTO_HERMANOS_PORCENTAJE != null
                  ? `${alumno.DTO_HERMANOS_PORCENTAJE}%`
                  : null
              }
            />
            <ReadOnlyField
              label="Ajuste manual (€)"
              value={formatCurrency(alumno.AJUSTE_MANUAL_EUR)}
            />
          </TabsContent>

          <TabsContent value="matricula">
            <MatriculasIncidenciasPanel
              alumnoId={alumno.ID_ALUMNO}
              lookups={lookups}
            />
          </TabsContent>
        </Tabs>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
