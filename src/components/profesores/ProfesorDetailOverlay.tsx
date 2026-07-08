import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Pencil, X } from "lucide-react";
import type {
  AulaLookup,
  EspecialidadLookup,
  ProfesorCreateInput,
  ProfesorData,
  ProfesorUpdateInput,
} from "@/hooks/useProfesores";
import { ALUMNO_OVERLAY_PANEL_CLASS } from "@/components/alumnos/AlumnoDetailOverlay";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactEmailRich, ContactPhoneRich } from "@/components/ui/ContactQuickActions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ProfesorForm } from "./ProfesorForm";
import { ProfesorAcademicoTab } from "./ProfesorAcademicoTab";
import { ProfesorFichajesTab } from "./ProfesorFichajesTab";
import { ProfesorDocumentosTab } from "./ProfesorDocumentosTab";
import {
  EstadoProfesorBadge,
  ReadOnlyField,
  TagBadges,
  formatFechaDisplay,
  formatSaldoDisplay,
} from "./profesoresShared";

type ProfesorOverlayTab = "personales" | "academico" | "fichajes" | "documentos";

export function ProfesorDetailOverlay({
  open,
  mode,
  profesor,
  aulas,
  especialidades,
  submitting,
  onClose,
  onEdit,
  onCancelEdit,
  onSubmit,
}: {
  open: boolean;
  mode: "detail" | "edit";
  profesor: ProfesorData | null;
  aulas: AulaLookup[];
  especialidades: EspecialidadLookup[];
  submitting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (values: ProfesorCreateInput | ProfesorUpdateInput) => void;
}) {
  const [activeTab, setActiveTab] = useState<ProfesorOverlayTab>("personales");

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

  useEffect(() => {
    if (!open) setActiveTab("personales");
  }, [open]);

  useEffect(() => {
    setActiveTab("personales");
  }, [profesor?.ID_PROFESOR]);

  if (!open) return null;

  if (!profesor) {
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

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/10"
        aria-label="Cerrar detalle del profesor"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profesor-overlay-title"
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
                <h2 id="profesor-overlay-title" className="truncate text-xl font-semibold">
                  Editar profesor
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
            <ProfesorForm
              key={profesor.ID_PROFESOR}
              initial={profesor}
              aulas={aulas}
              especialidades={especialidades}
              submitting={submitting}
              onSubmit={onSubmit}
            />
            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit" form="profesor-form" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="profesor-overlay-title" className="truncate text-xl font-semibold">
                  {profesor.NOMBRE_PROFESOR}
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
                  Editar Profesor
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

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ProfesorOverlayTab)}>
              <TabsList className="mb-4 grid w-full grid-cols-4">
                <TabsTrigger value="personales">Datos Personales</TabsTrigger>
                <TabsTrigger value="academico">Académico</TabsTrigger>
                <TabsTrigger value="fichajes">Fichajes</TabsTrigger>
                <TabsTrigger value="documentos">Documentos Legales</TabsTrigger>
              </TabsList>

              <TabsContent value="personales">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <ReadOnlyField label="Nombre" value={profesor.NOMBRE_PROFESOR} />
                  <ReadOnlyField
                    label="Email"
                    value={<ContactEmailRich email={profesor.EMAIL_PROFESORES} />}
                  />
                  <ReadOnlyField
                    label="Teléfono"
                    value={<ContactPhoneRich phone={profesor.TELEFONO} />}
                  />
                  <ReadOnlyField label="DNI" value={profesor.DNI} />
                  <ReadOnlyField label="Nº Seg. Social" value={profesor.N_SEG_SOCIAL} />
                  <ReadOnlyField label="Domicilio" value={profesor.DOMICILIO} />
                  <ReadOnlyField
                    label="Fecha de nacimiento"
                    value={formatFechaDisplay(profesor.NACIMIENTO)}
                  />
                  <ReadOnlyField
                    label="Fecha de alta"
                    value={formatFechaDisplay(profesor.FECHA_ALTA)}
                  />
                  <ReadOnlyField
                    label="Fecha de baja"
                    value={formatFechaDisplay(profesor.FECHA_BAJA)}
                  />
                  <ReadOnlyField
                    label="Saldo vacaciones"
                    value={formatSaldoDisplay(profesor.SALDO_VACACIONES)}
                  />
                  <ReadOnlyField label="Saldo AP" value={formatSaldoDisplay(profesor.SALDO_AP)} />
                  <ReadOnlyField
                    label="Estado"
                    value={<EstadoProfesorBadge fechaBaja={profesor.FECHA_BAJA} />}
                  />
                  <ReadOnlyField
                    label="Especialidades"
                    value={<TagBadges text={profesor.TEXTO_ESPECIALIDADES} />}
                    className="sm:col-span-2"
                  />
                  <ReadOnlyField
                    label="Aulas"
                    value={<TagBadges text={profesor.TEXTO_AULAS} />}
                    className="sm:col-span-2"
                  />
                </div>
              </TabsContent>

              <TabsContent value="academico">
                <ProfesorAcademicoTab profesorId={profesor.ID_PROFESOR} />
              </TabsContent>

              <TabsContent value="fichajes">
                <ProfesorFichajesTab profesorId={profesor.ID_PROFESOR} />
              </TabsContent>

              <TabsContent value="documentos">
                <ProfesorDocumentosTab profesorId={profesor.ID_PROFESOR} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
