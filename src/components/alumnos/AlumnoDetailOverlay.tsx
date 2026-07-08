import { useEffect, useState, type ReactNode } from "react";
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
import { AlumnoFormDialog } from "@/components/alumnos/AlumnoFormDialog";
import { calcEdad, type AlumnoFormValues } from "@/lib/alumnoSchema";
import {
  isBankRemittancePaymentMethod,
  isBizumPaymentMethod,
  normalizeMetodoPago,
} from "@/lib/alumnoPaymentUtils";
import { formatCurrency } from "@/lib/format";
import type { OnNavigateToEntity } from "@/lib/entityNavigation";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export const ALUMNO_OVERLAY_PANEL_CLASS =
  "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl max-h-[85vh] overflow-y-auto bg-card text-card-foreground border border-border shadow-xl rounded-lg z-50";

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
}: AlumnoDetailOverlayProps) {
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
  const isSepa = isBankRemittancePaymentMethod(metodoPago);
  const isBizum = isBizumPaymentMethod(metodoPago);
  const isSimplePayment = !isSepa && !isBizum;

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
                <TabsTrigger value="matricula">Académico</TabsTrigger>
              </TabsList>

              <TabsContent value="resumen" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ReadOnlyField label="Nombre alumno" value={alumno.NOMBRE_ALUMNO} />
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
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

                  {isBizum && (
                    <ReadOnlyField label="Teléfono Bizum" value={alumno.TLF_BIZUM} />
                  )}

                  {isSimplePayment && (
                    <>
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
                    </>
                  )}
                </div>

                {(isSepa || isBizum) && (
                  <div
                    className={cn(
                      "grid gap-4 sm:grid-cols-2",
                      isSepa ? "lg:grid-cols-3" : "lg:grid-cols-2",
                    )}
                  >
                    {isSepa && (
                      <SepaMandatoBlock
                        alumnoId={alumno.ID_ALUMNO}
                        idCliente={alumno.ID_CLIENTE}
                        alumnoNombre={alumno.NOMBRE_ALUMNO}
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
                  </div>
                )}

                <ReadOnlyField label="Motivo ajuste" value={alumno.MOTIVO_AJUSTE} className="w-full" />

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
    </>,
    document.body,
  );
}
