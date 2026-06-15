import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Fragment, useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Building2,
  ChevronDown,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  useCentros,
  type CentroCreateInput,
  type CentroData,
  type CursoEscolarCreateInput,
  type CursoEscolarData,
  type CursoEscolarFormInput,
  type CursoEscolarUpdateInput,
} from "@/hooks/useCentros";
import {
  EMPTY_EMPRESA_FORM,
  empresaToFormInput,
  useEmpresaCliente,
  type EmpresaClienteFormInput,
} from "@/hooks/useEmpresaCliente";
import { useActiveTenant, useApp } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";
import { canManageUsuarios } from "@/lib/tenantQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  deleteCursoEscolar,
  triggerCursoDeleteOtp,
  verifyCursoDeleteOtp,
} from "@/services/cursoDeleteVerification";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/escuela")({
  component: EscuelaPage,
});

const EMPTY_FORM: CentroCreateInput = {
  NOMBRE_CENTRO: "",
  DIRECCION: "",
  TELEFONO_CENTRO: "",
  EMAIL_CENTRO: "",
};

const EMPTY_CURSO_FORM: CursoEscolarFormInput = {
  NOMBRE_CURSO: "",
  FECHA_INICIO: "",
  FECHA_FIN: "",
  FESTIVOS: [],
};

function cursoToFormInput(curso: CursoEscolarData): CursoEscolarFormInput {
  return {
    NOMBRE_CURSO: curso.NOMBRE_CURSO ?? "",
    FECHA_INICIO: curso.FECHA_INICIO?.slice(0, 10) ?? "",
    FECHA_FIN: curso.FECHA_FIN?.slice(0, 10) ?? "",
    FESTIVOS: curso.FESTIVOS?.filter(Boolean) ?? [],
  };
}

function sortCursosEscolares(cursos: CursoEscolarData[]): CursoEscolarData[] {
  return [...cursos].sort((a, b) => {
    const byStart = b.FECHA_INICIO.localeCompare(a.FECHA_INICIO);
    if (byStart !== 0) return byStart;
    return (a.NOMBRE_CURSO ?? "").localeCompare(b.NOMBRE_CURSO ?? "");
  });
}

type CursoFormTarget =
  | { mode: "create" }
  | { mode: "edit"; cursoId: string };

function estadoBadgeClass(estado: string | null | undefined): string {
  const normalized = estado?.trim().toLowerCase();
  if (normalized === "activo") {
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200";
  }
  return "bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200";
}

const TABLE_COLS = 4;

const CURSO_ESCOLAR_GRID =
  "grid grid-cols-[minmax(0,2fr)_minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1fr)_4.75rem] items-center gap-x-3";

const OTP_LENGTH = 6;

function parseIsoDate(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toggleFestivoDate(value: string[], iso: string): string[] {
  return value.includes(iso)
    ? value.filter((d) => d !== iso)
    : [...value, iso].sort((a, b) => a.localeCompare(b));
}

function FestivosPicker({
  id,
  name,
  value,
  onChange,
  minDate,
  maxDate,
}: {
  id: string;
  name: string;
  value: string[];
  onChange: (dates: string[]) => void;
  minDate?: string;
  maxDate?: string;
}) {
  const selected = useMemo(
    () =>
      value
        .map((d) => parseIsoDate(d))
        .filter((d): d is Date => d !== undefined),
    [value],
  );

  const disabledMatcher = useMemo(() => {
    if (!minDate && !maxDate) return undefined;
    return (date: Date) => {
      const iso = format(date, "yyyy-MM-dd");
      if (minDate && iso < minDate) return true;
      if (maxDate && iso > maxDate) return true;
      return false;
    };
  }, [minDate, maxDate]);

  const isDateDisabled = (date: Date) => {
    if (!disabledMatcher) return false;
    return disabledMatcher(date);
  };

  const defaultMonth = parseIsoDate(minDate ?? value[0] ?? "") ?? new Date();

  return (
    <div id={id} className="space-y-3" role="group" aria-labelledby={`${id}-label`}>
      <Calendar
        id={`${id}-calendar`}
        name={name}
        mode="multiple"
        selected={selected}
        defaultMonth={defaultMonth}
        onSelect={(_dates, triggerDate) => {
          if (!triggerDate || isDateDisabled(triggerDate)) return;
          const iso = format(triggerDate, "yyyy-MM-dd");
          onChange(toggleFestivoDate(value, iso));
        }}
        disabled={disabledMatcher}
        className="rounded-md border bg-background p-0"
      />
      {value.map((fecha) => (
        <input key={fecha} type="hidden" name={name} value={fecha} readOnly />
      ))}
      {value.length > 0 && (
        <div id={`${id}-chips`} className="flex flex-wrap gap-1.5">
          {value.map((fecha) => (
            <Badge
              key={fecha}
              variant="secondary"
              className="gap-1 bg-slate-100 pr-1 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200"
            >
              {formatDisplayDate(fecha)}
              <button
                type="button"
                id={`${id}-remove-${fecha}`}
                name={`${name}-remove-${fecha}`}
                className="rounded-sm p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                aria-label={`Quitar festivo ${fecha}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(toggleFestivoDate(value, fecha));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

function CursoEscolarForm({
  formInstanceId,
  mode,
  initialValues,
  saving,
  onCancel,
  onSubmit,
}: {
  formInstanceId: string;
  mode: "create" | "edit";
  initialValues: CursoEscolarFormInput;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: CursoEscolarFormInput) => Promise<void>;
}) {
  const [form, setForm] = useState<CursoEscolarFormInput>(initialValues);

  const updateFormDates = (field: "FECHA_INICIO" | "FECHA_FIN", value: string) => {
    setForm((prev) => {
      const inicio = field === "FECHA_INICIO" ? value : prev.FECHA_INICIO;
      const fin = field === "FECHA_FIN" ? value : prev.FECHA_FIN;
      return {
        ...prev,
        [field]: value,
        FESTIVOS: prev.FESTIVOS.filter(
          (f) => (!inicio || f >= inicio) && (!fin || f <= fin),
        ),
      };
    });
  };

  const canSave =
    form.NOMBRE_CURSO.trim().length > 0 &&
    form.FECHA_INICIO.length > 0 &&
    form.FECHA_FIN.length > 0 &&
    form.FECHA_FIN >= form.FECHA_INICIO;

  const formId = `curso-escolar-form-${formInstanceId}`;

  return (
    <form
      id={formId}
      name="cursoEscolarForm"
      className="space-y-4 rounded-lg border bg-background/80 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canSave) return;
        await onSubmit({
          NOMBRE_CURSO: form.NOMBRE_CURSO.trim(),
          FECHA_INICIO: form.FECHA_INICIO,
          FECHA_FIN: form.FECHA_FIN,
          FESTIVOS: form.FESTIVOS,
        });
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="space-y-2">
        <Label htmlFor={`NOMBRE_CURSO-${formInstanceId}`}>Nombre del curso *</Label>
        <Input
          id={`NOMBRE_CURSO-${formInstanceId}`}
          name="NOMBRE_CURSO"
          value={form.NOMBRE_CURSO}
          onChange={(e) => setForm((prev) => ({ ...prev, NOMBRE_CURSO: e.target.value }))}
          placeholder="Ej. Curso 2025-2026"
          autoComplete="off"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`FECHA_INICIO-${formInstanceId}`}>Fecha inicio *</Label>
          <Input
            id={`FECHA_INICIO-${formInstanceId}`}
            name="FECHA_INICIO"
            type="date"
            value={form.FECHA_INICIO}
            max={form.FECHA_FIN || undefined}
            onChange={(e) => updateFormDates("FECHA_INICIO", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`FECHA_FIN-${formInstanceId}`}>Fecha fin *</Label>
          <Input
            id={`FECHA_FIN-${formInstanceId}`}
            name="FECHA_FIN"
            type="date"
            value={form.FECHA_FIN}
            min={form.FECHA_INICIO || undefined}
            onChange={(e) => updateFormDates("FECHA_FIN", e.target.value)}
            required
          />
        </div>
      </div>

      {form.FECHA_INICIO && form.FECHA_FIN && form.FECHA_FIN < form.FECHA_INICIO && (
        <p id={`${formId}-date-error`} className="text-sm text-destructive" role="alert">
          La fecha de fin debe ser igual o posterior a la fecha de inicio.
        </p>
      )}

      <div className="space-y-2">
        <Label id={`FESTIVOS-${formInstanceId}-label`} htmlFor={`FESTIVOS-${formInstanceId}`}>
          Festivos *
        </Label>
        <p className="text-xs text-muted-foreground">
          Haz clic en las fechas del calendario para marcar o desmarcar días festivos.
        </p>
        <FestivosPicker
          id={`FESTIVOS-${formInstanceId}`}
          name="FESTIVOS"
          value={form.FESTIVOS}
          onChange={(festivos) => setForm((prev) => ({ ...prev, FESTIVOS: festivos }))}
          minDate={form.FECHA_INICIO || undefined}
          maxDate={form.FECHA_FIN || undefined}
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="submit"
          id={`save-curso-${formInstanceId}`}
          name="saveCurso"
          size="sm"
          disabled={saving || !canSave}
        >
          {saving ? "Guardando..." : "Guardar Curso"}
        </Button>
        <Button
          type="button"
          id={`cancel-curso-${formInstanceId}`}
          name="cancelCurso"
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function CursoDeleteOtpModal({
  open,
  verificationOtp,
  deleting,
  onOtpChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  verificationOtp: string;
  deleting: boolean;
  onOtpChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const otpValid =
    verificationOtp.length === OTP_LENGTH && /^\d{6}$/.test(verificationOtp);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmación de seguridad requerida</DialogTitle>
          <DialogDescription>
            Esta es una acción crítica. Se eliminarán de forma permanente todas las matrículas,
            grupos, sesiones y alumnos vinculados a este año académico. Introduce el código de 6
            dígitos enviado a tu correo corporativo para confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="curso-delete-otp">Código de verificación</Label>
          <Input
            id="curso-delete-otp"
            name="cursoDeleteOtp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH}
            placeholder="000000"
            value={verificationOtp}
            className="text-center text-lg tracking-[0.35em] tabular-nums"
            required
            onChange={(e) =>
              onOtpChange(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))
            }
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting || !otpValid}
            onClick={onConfirm}
          >
            {deleting ? "Eliminando..." : "Confirmar Eliminación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CursoEscolarHistoryTable({
  cursos,
  deletingCourseId,
  sendingOtp,
  onEdit,
  onDelete,
}: {
  cursos: CursoEscolarData[];
  deletingCourseId: string | null;
  sendingOtp: boolean;
  onEdit: (cursoId: string) => void;
  onDelete: (curso: CursoEscolarData) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border bg-background/60">
      <div
        className={cn(
          CURSO_ESCOLAR_GRID,
          "border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground",
        )}
      >
        <span>Nombre del curso</span>
        <span>Estado</span>
        <span>Inicio</span>
        <span>Fin</span>
        <span className="sr-only">Acciones</span>
      </div>
      {cursos.map((curso) => (
        <div
          key={curso.ID_CURSO}
          className={cn(
            CURSO_ESCOLAR_GRID,
            "border-b px-3 py-2.5 text-sm last:border-b-0 hover:bg-muted/30",
          )}
        >
          <span className="truncate font-medium">{curso.NOMBRE_CURSO}</span>
          <span>
            <Badge variant="secondary" className={estadoBadgeClass(curso.ESTADO)}>
              {curso.ESTADO?.trim() || "—"}
            </Badge>
          </span>
          <span className="tabular-nums text-muted-foreground">
            {formatDisplayDate(curso.FECHA_INICIO)}
          </span>
          <span className="tabular-nums text-muted-foreground">
            {formatDisplayDate(curso.FECHA_FIN)}
          </span>
          <span className="flex justify-end gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Editar ${curso.NOMBRE_CURSO}`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(curso.ID_CURSO);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              aria-label={`Eliminar ${curso.NOMBRE_CURSO}`}
              disabled={sendingOtp || deletingCourseId === curso.ID_CURSO}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(curso);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        </div>
      ))}
    </div>
  );
}

function EmpresaDatosDialog({
  open,
  loading,
  submitting,
  initialValues,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  submitting: boolean;
  initialValues: EmpresaClienteFormInput;
  onClose: () => void;
  onSubmit: (values: EmpresaClienteFormInput) => Promise<void>;
}) {
  const [form, setForm] = useState<EmpresaClienteFormInput>(initialValues);

  useEffect(() => {
    if (open) setForm(initialValues);
  }, [open, initialValues]);

  const canSave = useMemo(
    () =>
      form.NOMBRE_ESCUELA.trim().length > 0 &&
      form.TLF_REAL.trim().length > 0 &&
      form.URL_WEB.trim().length > 0 &&
      form.EMAIL_CLIENTE.trim().length > 0 &&
      form.APP_LOGO.trim().length > 0 &&
      form.CIF.trim().length > 0 &&
      form.DIRECCION.trim().length > 0,
    [form],
  );

  const setField = (field: keyof EmpresaClienteFormInput) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Datos de la Empresa</DialogTitle>
          <DialogDescription>
            Información principal de la escuela vinculada a tu workspace activo.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <form
            id="empresa-datos-form"
            name="empresaDatosForm"
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!canSave) return;
              await onSubmit(form);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="NOMBRE_ESCUELA">Nombre de la escuela *</Label>
              <Input
                id="NOMBRE_ESCUELA"
                name="NOMBRE_ESCUELA"
                value={form.NOMBRE_ESCUELA}
                onChange={setField("NOMBRE_ESCUELA")}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="TLF_REAL">Teléfono *</Label>
                <Input
                  id="TLF_REAL"
                  name="TLF_REAL"
                  type="tel"
                  value={form.TLF_REAL}
                  onChange={setField("TLF_REAL")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="EMAIL_CLIENTE">Email *</Label>
                <Input
                  id="EMAIL_CLIENTE"
                  name="EMAIL_CLIENTE"
                  type="email"
                  value={form.EMAIL_CLIENTE}
                  onChange={setField("EMAIL_CLIENTE")}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="URL_WEB">Sitio web *</Label>
              <Input
                id="URL_WEB"
                name="URL_WEB"
                type="url"
                value={form.URL_WEB}
                onChange={setField("URL_WEB")}
                placeholder="https://"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="APP_LOGO">Logo (URL) *</Label>
              <Input
                id="APP_LOGO"
                name="APP_LOGO"
                type="url"
                value={form.APP_LOGO}
                onChange={setField("APP_LOGO")}
                placeholder="https://"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="CIF">CIF *</Label>
                <Input
                  id="CIF"
                  name="CIF"
                  value={form.CIF}
                  onChange={setField("CIF")}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="DIRECCION">Dirección *</Label>
                <Input
                  id="DIRECCION"
                  name="DIRECCION"
                  value={form.DIRECCION}
                  onChange={setField("DIRECCION")}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || !canSave}>
                {submitting ? "Guardando..." : "Guardar datos"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CentroExpandedDetail({
  centro,
  savingCurso,
  onCreateCurso,
  onUpdateCurso,
  onCoursesReload,
}: {
  centro: CentroData;
  savingCurso: boolean;
  onCreateCurso: (values: CursoEscolarCreateInput) => Promise<void>;
  onUpdateCurso: (values: CursoEscolarUpdateInput) => Promise<void>;
  onCoursesReload: () => Promise<void>;
}) {
  const [activeForm, setActiveForm] = useState<CursoFormTarget | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [verificationOtp, setVerificationOtp] = useState("");
  const [targetCourseId, setTargetCourseId] = useState<string | null>(null);
  const [deletingCourse, setDeletingCourse] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  const cursos = useMemo(
    () => sortCursosEscolares(centro.CURSO_ESCOLAR ?? []),
    [centro.CURSO_ESCOLAR],
  );

  const editingCurso =
    activeForm?.mode === "edit"
      ? (cursos.find((c) => c.ID_CURSO === activeForm.cursoId) ?? null)
      : null;

  const openCreateForm = () => setActiveForm({ mode: "create" });

  const openEditForm = (cursoId: string) => setActiveForm({ mode: "edit", cursoId });

  const closeForm = () => setActiveForm(null);

  const formInstanceId =
    activeForm?.mode === "edit"
      ? `${centro.ID_CENTRO}-${activeForm.cursoId}`
      : `${centro.ID_CENTRO}-new`;

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setVerificationOtp("");
    setTargetCourseId(null);
  };

  const handleDeleteClick = async (curso: CursoEscolarData) => {
    setSendingOtp(true);
    try {
      await triggerCursoDeleteOtp(curso.ID_CURSO);
      setTargetCourseId(curso.ID_CURSO);
      setVerificationOtp("");
      setIsDeleteModalOpen(true);
      toast.success("Código de verificación enviado a tu correo corporativo.");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo generar el código de verificación.";
      toast.error(message);
    } finally {
      setSendingOtp(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (
      !targetCourseId ||
      verificationOtp.length !== OTP_LENGTH ||
      !/^\d{6}$/.test(verificationOtp)
    ) {
      toast.error("Introduce un código de verificación válido de 6 dígitos.");
      return;
    }

    setDeletingCourse(true);
    try {
      await verifyCursoDeleteOtp(targetCourseId, verificationOtp);
      await deleteCursoEscolar(targetCourseId);
      toast.success("Curso escolar eliminado correctamente.");
      closeDeleteModal();
      await onCoursesReload();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "El código es incorrecto o ha expirado. Comprueba el correo e inténtalo de nuevo.";
      toast.error(message);
    } finally {
      setDeletingCourse(false);
    }
  };

  return (
    <div className="border-t bg-muted/15 px-4 py-5 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        <section className="space-y-4">
          <h3 className="text-sm font-semibold tracking-tight">Datos del centro</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Dirección" value={centro.DIRECCION} />
            <DetailField label="Teléfono" value={centro.TELEFONO_CENTRO} />
            <DetailField label="Email" value={centro.EMAIL_CENTRO} />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold tracking-tight">Curso escolar</h3>
            {!activeForm && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateForm();
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Añadir Nuevo Curso Escolar
              </Button>
            )}
          </div>

          {activeForm ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {activeForm.mode === "create"
                  ? "Nuevo curso escolar"
                  : `Editando: ${editingCurso?.NOMBRE_CURSO ?? "curso"}`}
              </p>
              <CursoEscolarForm
                key={formInstanceId}
                formInstanceId={formInstanceId}
                mode={activeForm.mode}
                initialValues={
                  activeForm.mode === "edit" && editingCurso
                    ? cursoToFormInput(editingCurso)
                    : EMPTY_CURSO_FORM
                }
                saving={savingCurso}
                onCancel={closeForm}
                onSubmit={async (values) => {
                  if (activeForm.mode === "edit" && editingCurso) {
                    await onUpdateCurso({
                      ...values,
                      ID_CURSO: editingCurso.ID_CURSO,
                    });
                  } else {
                    await onCreateCurso({
                      ...values,
                      ID_CENTRO: centro.ID_CENTRO,
                    });
                  }
                  closeForm();
                }}
              />
            </div>
          ) : cursos.length > 0 ? (
            <CursoEscolarHistoryTable
              cursos={cursos}
              deletingCourseId={deletingCourse ? targetCourseId : null}
              sendingOtp={sendingOtp}
              onEdit={openEditForm}
              onDelete={handleDeleteClick}
            />
          ) : (
            <div className="rounded-lg border border-dashed bg-background/60 p-5">
              <p className="text-sm text-muted-foreground">
                Este centro aún no tiene cursos escolares registrados.
              </p>
            </div>
          )}
        </section>
      </div>

      <CursoDeleteOtpModal
        open={isDeleteModalOpen}
        verificationOtp={verificationOtp}
        deleting={deletingCourse}
        onOtpChange={setVerificationOtp}
        onClose={closeDeleteModal}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

function CreateCentroDialog({
  open,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: CentroCreateInput) => Promise<void>;
}) {
  const [form, setForm] = useState<CentroCreateInput>(EMPTY_FORM);

  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir nueva sede</DialogTitle>
          <DialogDescription>
            Crea una nueva sucursal para la escuela activa. El identificador de sede se genera
            automáticamente en el servidor.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.NOMBRE_CENTRO.trim() || !form.DIRECCION.trim()) return;
            await onSubmit({
              NOMBRE_CENTRO: form.NOMBRE_CENTRO.trim(),
              DIRECCION: form.DIRECCION.trim(),
              TELEFONO_CENTRO: form.TELEFONO_CENTRO?.trim() || null,
              EMAIL_CENTRO: form.EMAIL_CENTRO?.trim() || null,
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="nombre-centro">Nombre de la sede *</Label>
            <Input
              id="nombre-centro"
              value={form.NOMBRE_CENTRO}
              onChange={(e) => setForm((prev) => ({ ...prev, NOMBRE_CENTRO: e.target.value }))}
              placeholder="Ej. Sede Centro"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="direccion-centro">Dirección *</Label>
            <Input
              id="direccion-centro"
              value={form.DIRECCION}
              onChange={(e) => setForm((prev) => ({ ...prev, DIRECCION: e.target.value }))}
              placeholder="Calle, número, ciudad"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="telefono-centro">Teléfono</Label>
            <Input
              id="telefono-centro"
              type="tel"
              value={form.TELEFONO_CENTRO ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, TELEFONO_CENTRO: e.target.value }))}
              placeholder="+34 600 000 000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-centro">Email</Label>
            <Input
              id="email-centro"
              type="email"
              value={form.EMAIL_CENTRO ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, EMAIL_CENTRO: e.target.value }))}
              placeholder="sede@escuela.com"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                submitting || !form.NOMBRE_CENTRO.trim() || !form.DIRECCION.trim()
              }
            >
              {submitting ? "Guardando..." : "Crear sede"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EscuelaPage() {
  const { activePerfil } = useApp();
  const canAccess = hasPermission(activePerfil?.ROL ?? null, "clientes:write");

  if (!canAccess) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No tienes permiso para acceder a la configuración de la escuela.
      </div>
    );
  }

  return <EscuelaPageContent canAccess={canAccess} />;
}

function EscuelaPageContent({ canAccess }: { canAccess: boolean }) {
  const { rol, cliente } = useActiveTenant();
  const { list, create, createCurso, updateCurso } = useCentros();
  const { detail: empresa, update: updateEmpresa } = useEmpresaCliente();

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [empresaOpen, setEmpresaOpen] = useState(false);
  const [expandedCentroId, setExpandedCentroId] = useState<string | null>(null);

  const canCreateCentro = canManageUsuarios(rol);

  const empresaFormInitial = useMemo(
    () => (empresa.data ? empresaToFormInput(empresa.data) : EMPTY_EMPRESA_FORM),
    [empresa.data],
  );

  const escuelaNombre =
    empresa.data?.NOMBRE_ESCUELA?.trim() ||
    cliente?.NOMBRE_ESCUELA?.trim() ||
    "tu escuela";

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (c) =>
        c.NOMBRE_CENTRO?.toLowerCase().includes(q) ||
        c.DIRECCION?.toLowerCase().includes(q) ||
        c.TELEFONO_CENTRO?.toLowerCase().includes(q) ||
        c.EMAIL_CENTRO?.toLowerCase().includes(q),
    );
  }, [list.data, query]);

  const handleCreateCurso = async (values: CursoEscolarCreateInput) => {
    try {
      await createCurso.mutateAsync(values);
      toast.success("Curso escolar creado correctamente.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo crear el curso escolar.";
      toast.error(
        message.includes("[ERROR_MULTITENANT]")
          ? "No se pudo identificar la escuela activa. Cambia de workspace e inténtalo de nuevo."
          : message,
      );
      throw err;
    }
  };

  const handleCoursesReload = async () => {
    await list.refetch();
  };

  const handleUpdateCurso = async (values: CursoEscolarUpdateInput) => {
    try {
      await updateCurso.mutateAsync(values);
      toast.success("Curso escolar actualizado correctamente.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo actualizar el curso escolar.";
      toast.error(
        message.includes("[ERROR_MULTITENANT]")
          ? "No se pudo identificar la escuela activa. Cambia de workspace e inténtalo de nuevo."
          : message,
      );
      throw err;
    }
  };

  const handleSaveEmpresa = async (values: EmpresaClienteFormInput) => {
    try {
      await updateEmpresa.mutateAsync(values);
      toast.success("Datos de la empresa guardados correctamente.");
      setEmpresaOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudieron guardar los datos de la empresa.";
      toast.error(
        message.includes("[ERROR_MULTITENANT]")
          ? "No se pudo identificar la escuela activa. Cambia de workspace e inténtalo de nuevo."
          : message,
      );
      throw err;
    }
  };

  const handleCreate = async (values: CentroCreateInput) => {
    try {
      await create.mutateAsync(values);
      toast.success("Sede creada correctamente.");
      setCreating(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo crear la sede.";
      toast.error(
        message.includes("[ERROR_MULTITENANT]")
          ? "No se pudo identificar la escuela activa. Cambia de workspace e inténtalo de nuevo."
          : message,
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Escuela</h1>
          <p className="text-sm text-muted-foreground">Configuración de {escuelaNombre}</p>
        </div>
        {canAccess && (
          <Button
            type="button"
            variant="outline"
            className="shrink-0 gap-2 shadow-sm"
            onClick={() => setEmpresaOpen(true)}
          >
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Modificar/Ver datos empresa
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Sedes y centros
            </h2>
            <p className="text-sm text-muted-foreground">
              {list.data?.length ?? 0} sede{(list.data?.length ?? 0) === 1 ? "" : "s"} registrada
              {(list.data?.length ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          {canCreateCentro && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Añadir Nueva Sede
            </Button>
          )}
        </div>

        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, dirección, teléfono o email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {list.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar sedes: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 text-xs font-semibold">Nombre</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Dirección</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Teléfono</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={TABLE_COLS} className="py-2">
                      <Skeleton className="h-7 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={TABLE_COLS}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {query.trim()
                      ? "No hay sedes que coincidan con la búsqueda."
                      : "Aún no hay sedes registradas."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((centro) => {
                  const isExpanded = expandedCentroId === centro.ID_CENTRO;

                  return (
                    <Fragment key={centro.ID_CENTRO}>
                      <TableRow
                        className={cn(
                          "cursor-pointer transition-colors",
                          isExpanded ? "bg-muted/40 hover:bg-muted/40" : "hover:bg-muted/30",
                        )}
                        onClick={() =>
                          setExpandedCentroId((current) =>
                            current === centro.ID_CENTRO ? null : centro.ID_CENTRO,
                          )
                        }
                      >
                        <TableCell className="py-2.5 font-medium">
                          <div className="flex items-center gap-2">
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300",
                                isExpanded && "rotate-180",
                              )}
                            />
                            <span>{centro.NOMBRE_CENTRO}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 text-sm text-muted-foreground">
                          {centro.DIRECCION || "—"}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm">
                          {centro.TELEFONO_CENTRO || "—"}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm">
                          {centro.EMAIL_CENTRO || "—"}
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={TABLE_COLS} className="p-0">
                            <div className="animate-in fade-in-0 slide-in-from-top-2 duration-300">
                              <CentroExpandedDetail
                                centro={centro}
                                savingCurso={createCurso.isPending || updateCurso.isPending}
                                onCreateCurso={handleCreateCurso}
                                onUpdateCurso={handleUpdateCurso}
                                onCoursesReload={handleCoursesReload}
                              />
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
      </Card>

      <CreateCentroDialog
        open={creating}
        submitting={create.isPending}
        onClose={() => setCreating(false)}
        onSubmit={handleCreate}
      />

      {canAccess && (
        <EmpresaDatosDialog
          open={empresaOpen}
          loading={empresa.isLoading}
          submitting={updateEmpresa.isPending}
          initialValues={empresaFormInitial}
          onClose={() => setEmpresaOpen(false)}
          onSubmit={handleSaveEmpresa}
        />
      )}
    </div>
  );
}
