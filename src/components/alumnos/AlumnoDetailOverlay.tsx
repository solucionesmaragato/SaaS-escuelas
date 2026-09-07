import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Pencil, X } from "lucide-react";
import type {
  AlumnoTree,
  AlumnoUpdateInput,
  HorarioCreateInput,
  HorarioUpdateInput,
} from "@/hooks/useAlumnosTree";
import { AlumnoFacturasTable } from "@/components/alumnos/AlumnoFacturasTable";
import { AlumnoAcademicoTab } from "@/components/alumnos/AlumnoAcademicoTab";
import { SepaMandatoBlock } from "@/components/alumnos/SepaMandatoBlock";
import { ContactEmailRich, ContactPhoneRich } from "@/components/ui/ContactQuickActions";
import type { GrupoHorarioSlot } from "@/hooks/useGruposHorarios";
import type { CentroData } from "@/hooks/useCentros";
import { AlumnoFormDialog } from "@/components/alumnos/AlumnoFormDialog";
import { calcEdad, type AlumnoFormValues } from "@/lib/alumnoSchema";
import {
  isBankRemittancePaymentMethod,
  isBizumPaymentMethod,
  normalizeMetodoPago,
} from "@/lib/alumnoPaymentUtils";
import { formatCurrency } from "@/lib/format";
import {
  useCargosExtra,
  calcCargoExtraRowTotal,
  cargoExtraEstadoStatus,
  formatCargoExtraFecha,
  canEditCargoExtraRole,
  type CargoExtraRow,
} from "@/hooks/useCargosExtra";
import { CargoExtraDetailDialog } from "@/components/alumnos/CargoExtraDetailDialog";
import { useActiveTenant } from "@/context/AppContext";
import type { OnNavigateToEntity } from "@/lib/entityNavigation";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatriculaFirmadaPdfButton } from "@/components/matricula/MatriculaFirmadaPdfButton";
import { EnviarMatriculaOnlineButton } from "@/components/matricula/EnviarMatriculaOnlineButton";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isSecretariaRole,
} from "@/lib/tenantQuery";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const ALUMNO_OVERLAY_PANEL_CLASS =
  "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-1rem)] max-h-[92dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card text-card-foreground shadow-xl md:w-full md:max-h-[85vh] md:max-w-5xl";

/** Sticky header for panels with `p-4 md:p-6` (keeps X visible while scrolling on mobile). */
export const OVERLAY_PANEL_HEADER_CLASS =
  "sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 pb-4 md:-mx-6 md:px-6";

/** Sticky header for panels with `p-6`. */
export const OVERLAY_PANEL_HEADER_CLASS_P6 =
  "sticky top-0 z-10 -mx-6 mb-4 flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 pb-4";

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

function formatCentroNombre(
  idCentro: string | null | undefined,
  centroNombreById: Map<string, string>,
): string {
  const id = idCentro?.trim();
  if (!id) return "—";
  return centroNombreById.get(id) ?? id;
}

function AuthBadge({ label, granted }: { label: string; granted: boolean | null | undefined }) {
  const ok = granted === true;
  return (
    <StatusBadge status={ok ? "success" : "destructive"} className="rounded-md px-2.5 py-1">
      {label}: {ok ? "Sí" : "No"}
    </StatusBadge>
  );
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

function estadoResumenBadgeStatus(
  value: string | null | undefined,
): "success" | "warning" | "destructive" | "neutral" {
  const current = value?.trim() ?? "";
  if (!current) return "neutral";
  if (current === "Pagado") return "success";
  if (current === "Cobrar") return "warning";
  if (current === "Devolver") return "destructive";
  return "neutral";
}

function EstadoReadOnly({
  label,
  value,
  mesValue,
}: {
  label: string;
  value: string | null | undefined;
  mesValue?: string | null | undefined;
}) {
  const display = value?.trim() ?? "";

  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {!display ? (
          <p className="text-sm font-medium">—</p>
        ) : (
          <StatusBadge status={estadoResumenBadgeStatus(value)} className="font-normal">
            {display}
          </StatusBadge>
        )}
        {display === "Devolver" && mesValue?.trim() ? (
          <Badge variant="outline" className="font-normal">
            Mes devolución: {mesValue}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

type SelectOptions = {
  especialidades: Array<{ id: string; label: string }>;
  tarifas: Array<{ id: string; label: string }>;
  profesores: Array<{ id: string; label: string }>;
};

export type AlumnoDetailOverlayProps = {
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
  onNavigateToEntity: OnNavigateToEntity;
  centros?: CentroData[];
  showCentroSelector?: boolean;
  assignedCenterId?: string | null;
  initialTab?: "resumen" | "pago";
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
  onNavigateToEntity,
  centros = [],
  showCentroSelector = false,
  assignedCenterId = null,
  initialTab,
}: AlumnoDetailOverlayProps) {
  const { rol } = useActiveTenant();
  const [activeTab, setActiveTab] = useState("resumen");
  const alumnoId = alumno?.ID_ALUMNO ?? null;
  const { listByAlumno: cargosExtraByAlumno, update: updateCargoExtra } = useCargosExtra({
    alumnoId,
  });
  const [selectedCargoExtra, setSelectedCargoExtra] = useState<CargoExtraRow | null>(null);
  const [cargoExtraDetailOpen, setCargoExtraDetailOpen] = useState(false);
  const canEditCargoExtra = canEditCargoExtraRole(rol);
  const canMatriculaOnlineStaff =
    isMasterRole(rol) ||
    isAdminRole(rol) ||
    isSecretariaRole(rol) ||
    isDireccionRole(rol);

  const centroNombreById = useMemo(
    () => new Map(centros.map((c) => [c.ID_CENTRO, c.NOMBRE_CENTRO])),
    [centros],
  );

  useEffect(() => {
    if (!open) {
      setActiveTab("resumen");
      return;
    }
    setActiveTab(initialTab ?? "resumen");
  }, [open, alumnoId, initialTab]);

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
        <div className={cn(ALUMNO_OVERLAY_PANEL_CLASS, "flex items-center justify-center p-4 md:p-6")}>
          <Skeleton className="h-8 w-48" />
        </div>
      </>,
      document.body,
    );
  }

  const edad = calcEdad(alumno.NACIMIENTO);
  const tutors = buildTutorRows(alumno);
  const metodoPago = normalizeMetodoPago(alumno.METODO_PAGO);
  const isSepa = isBankRemittancePaymentMethod(metodoPago);
  const isBizum = isBizumPaymentMethod(metodoPago);

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
        className={cn(ALUMNO_OVERLAY_PANEL_CLASS, "p-4 md:p-6")}
      >
        {mode === "edit" ? (
          <>
            <header className={OVERLAY_PANEL_HEADER_CLASS}>
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
              key={alumno.ID_ALUMNO}
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
              centros={centros}
              showCentroSelector={showCentroSelector}
              assignedCenterId={assignedCenterId}
              onClose={onCancelEdit}
              onSubmit={onEditSubmit}
              onCreateHorario={onCreateHorario}
              onUpdateHorario={onUpdateHorario}
              onRemoveHorario={onRemoveHorario}
            />
          </>
        ) : (
          <>
            <header className={OVERLAY_PANEL_HEADER_CLASS}>
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
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {canMatriculaOnlineStaff && (
                  <MatriculaFirmadaPdfButton idAlumno={alumno.ID_ALUMNO} />
                )}
                <Button type="button" variant="brand" size="sm" className="gap-2" onClick={onEdit}>
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
              <TabsList className="mb-4 grid h-auto w-full grid-cols-2 gap-1 p-1 md:mb-4 md:h-9 md:grid-cols-4 md:gap-0">
                <TabsTrigger value="resumen" className="text-xs md:text-sm">
                  Resumen
                </TabsTrigger>
                <TabsTrigger value="personales" className="text-xs md:text-sm">
                  Datos personales
                </TabsTrigger>
                <TabsTrigger value="pago" className="text-xs md:text-sm">
                  Datos de pago
                </TabsTrigger>
                <TabsTrigger value="matricula" className="text-xs md:text-sm">
                  Académico
                </TabsTrigger>
              </TabsList>

              <TabsContent value="resumen" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ReadOnlyField
                  label="Nombre y apellidos del alumno"
                  value={alumno.NOMBRE_ALUMNO}
                />
                <ReadOnlyField
                  label="Centro"
                  value={formatCentroNombre(alumno.ID_CENTRO, centroNombreById)}
                />
                <ReadOnlyField
                  label="Tel. comunicación"
                  value={<ContactPhoneRich phone={alumno.TLF_COMUNICACION} />}
                />
                <ReadOnlyField label="Email" value={<ContactEmailRich email={alumno.MAIL} />} />

                <EstadoReadOnly
                  label="Estado matrícula"
                  value={alumno.ESTADO_MATRICULA}
                  mesValue={alumno.MES_DEVOLUCION_RESERVA}
                />

                <EstadoReadOnly
                  label="Estado reserva"
                  value={alumno.ESTADO_RESERVA}
                  mesValue={alumno.MES_DEVOLUCION_RESERVA}
                />

                <ReadOnlyField
                  label="Total mensual (€)"
                  value={formatCurrency(alumno.TOTAL_MENSUAL)}
                />

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
                        <ReadOnlyField
                          label={`${tutor.label} — Teléfono`}
                          value={<ContactPhoneRich phone={tutor.telefono} />}
                        />
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

              <TabsContent value="pago" className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

                  {isSepa && (
                    <>
                      <ReadOnlyField label="IBAN" value={alumno.IBAN} />
                      <ReadOnlyField label="Titular cuenta" value={alumno.TITULAR_CUENTA} />
                    </>
                  )}

                  {isBizum && <ReadOnlyField label="Teléfono Bizum" value={alumno.TLF_BIZUM} />}

                  {isSepa && (
                    <SepaMandatoBlock
                      alumnoId={alumno.ID_ALUMNO}
                      idCliente={alumno.ID_CLIENTE}
                      alumnoNombre={alumno.NOMBRE_ALUMNO}
                      interactive
                    />
                  )}

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
                  <ReadOnlyField
                    label="Motivo ajuste"
                    value={alumno.MOTIVO_AJUSTE}
                    className="sm:col-span-2"
                  />
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  El ajuste manual pendiente se convertirá en una línea del próximo recibo al
                  generar la remesa; no modifica recibos ya emitidos.
                </p>

                {canMatriculaOnlineStaff && (
                  <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/50 p-4">
                    <h3 className="text-sm font-semibold tracking-tight">Matrícula online</h3>
                    <p className="text-xs text-muted-foreground">
                      Envíe o copie el enlace para que la familia complete o renueve la matrícula
                      online. Los datos de pago del alumno se precargarán en el formulario.
                    </p>
                    <EnviarMatriculaOnlineButton
                      idAlumno={alumno.ID_ALUMNO}
                      telefono={alumno.TLF_COMUNICACION}
                      nombreAlumno={alumno.NOMBRE_ALUMNO}
                      nombreMadre={alumno.NOMBRE_MADRE}
                      nombrePadre={alumno.NOMBRE_PADRE}
                      estadoAlumno={alumno.ESTADO_ALUMNO}
                      canWrite={canMatriculaOnlineStaff}
                    />
                  </div>
                )}

                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-semibold tracking-tight">Cargos extra</h3>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Concepto</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                          <TableHead className="text-right">Precio unit.</TableHead>
                          <TableHead className="text-right">IVA %</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Recibo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cargosExtraByAlumno.isLoading ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className="py-6 text-center text-muted-foreground"
                            >
                              Cargando cargos extra...
                            </TableCell>
                          </TableRow>
                        ) : cargosExtraByAlumno.isError ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className="py-6 text-center text-sm text-destructive"
                            >
                              {(cargosExtraByAlumno.error as Error)?.message ??
                                "Error al cargar los cargos extra."}
                            </TableCell>
                          </TableRow>
                        ) : (cargosExtraByAlumno.data ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className="py-6 text-center text-muted-foreground"
                            >
                              Sin cargos extra
                            </TableCell>
                          </TableRow>
                        ) : (
                          (cargosExtraByAlumno.data ?? []).map((row) => (
                            <TableRow
                              key={row.ID_CARGO}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                setSelectedCargoExtra(row);
                                setCargoExtraDetailOpen(true);
                              }}
                            >
                              <TableCell>{row.CONCEPTO}</TableCell>
                              <TableCell className="text-right">{row.CANTIDAD}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(row.PRECIO_UNITARIO)}
                              </TableCell>
                              <TableCell className="text-right">{row.PORCENTAJE_IVA}%</TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(calcCargoExtraRowTotal(row))}
                              </TableCell>
                              <TableCell>
                                <StatusBadge
                                  status={cargoExtraEstadoStatus(row.ESTADO)}
                                  className="capitalize"
                                >
                                  {row.ESTADO ?? "—"}
                                </StatusBadge>
                              </TableCell>
                              <TableCell>{formatCargoExtraFecha(row)}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {row.ID_RECIBO_VINCULADO ? (
                                  <span title={row.ID_RECIBO_VINCULADO}>Vinculado a recibo</span>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-semibold tracking-tight">Facturas y recibos</h3>
                  <AlumnoFacturasTable
                    alumnoId={alumno.ID_ALUMNO}
                    onNavigateToEntity={onNavigateToEntity}
                  />
                </div>
              </TabsContent>

              <TabsContent value="matricula">
                <AlumnoAcademicoTab
                  alumno={alumno}
                  lookups={lookups}
                  onNavigateToEntity={onNavigateToEntity}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
      <CargoExtraDetailDialog
        open={cargoExtraDetailOpen}
        onOpenChange={setCargoExtraDetailOpen}
        cargo={selectedCargoExtra}
        canEdit={canEditCargoExtra}
        updating={updateCargoExtra.isPending}
        onUpdate={(input) => updateCargoExtra.mutateAsync(input)}
        onUpdated={setSelectedCargoExtra}
      />
    </>,
    document.body,
  );
}
