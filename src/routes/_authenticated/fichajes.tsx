import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import jsQR from "jsqr";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  FilePenLine,
  MapPin,
  MoreVertical,
  Pause,
  Play,
  Plus,
  Printer,
  QrCode,
  Search,
  ShieldAlert,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { CorrectionRequestDialog } from "@/components/fichajes/CorrectionRequestDialog";
import { FichajeIncidenciasPanel } from "@/components/fichajes/FichajeIncidenciasPanel";
import { ALUMNO_OVERLAY_PANEL_CLASS, OVERLAY_PANEL_HEADER_CLASS_P6 } from "@/components/alumnos/AlumnoDetailOverlay";
import { PageHeader } from "@/components/layout/PageHeader";
import { EntityLink } from "@/components/navigation/EntityLink";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { collectFichajeComplianceMetadata } from "@/lib/fichajeCompliance";
import { logFichajeRejection } from "@/lib/fichajeAudit";
import {
  canRequestCorrection,
  CLOCK_MOVEMENT_TYPES,
  CORRECCION_PENDIENTE,
  formatFichajeErrorMessage,
  isCorrectionMovement,
  MODIFICACION_PENDIENTE,
} from "@/lib/fichajeEidas";
import {
  filterProfesoresActivos,
  formatProfesorOptionLabel,
  sortProfesoresByNombre,
} from "@/lib/profesorSelector";
import {
  fetchConciliacionAdminRange,
  useFichajes,
  useFichajesConciliacionAdmin,
  type FichajeConciliacionAdminRow,
  type FichajeCreateInput,
  type FichajeData,
  type FichajeSealedCreateInput,
  type ProfesorLookup,
} from "@/hooks/useFichajes";
import { useAdminCentroFilter, type CentroData } from "@/hooks/useAdminCentroFilter";
import { useAvisosInternos } from "@/hooks/useAvisosInternos";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant, useApp } from "@/context/AppContext";
import {
  isAdminRole,
  isMasterRole,
  isProfesorRole,
  isSecretariaRole,
  tenantListKey,
} from "@/lib/tenantQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fichajeHasIncidencias } from "@/lib/fichajeIncidencias";
import { toast } from "sonner";

type FichajesSearch = {
  profesorId?: string;
  fichajeId?: string;
};

export const Route = createFileRoute("/_authenticated/fichajes")({
  validateSearch: (search: Record<string, unknown>): FichajesSearch => {
    const result: FichajesSearch = {};
    const profesorId = search.profesorId;
    const fichajeId = search.fichajeId;
    if (typeof profesorId === "string" && profesorId) result.profesorId = profesorId;
    if (typeof fichajeId === "string" && fichajeId) result.fichajeId = fichajeId;
    return result;
  },
  component: FichajesPage,
});

const ALL_VALUE = "__all__";
const MOVIMIENTO_OPTIONS = ["Entrada", "Salida", "Inicio Pausa", "Fin de Pausa"] as const;

type FicharClockState = "out" | "in" | "paused";

function buildFichajeQrUrl(tenantId: string, centerId: string): string {
  return `${window.location.origin}/fichajes?action=scan&id_cliente=${tenantId}&id_centro=${centerId}`;
}

function parseFichajeQrPayload(
  value: string,
): { tenantId: string; centerId: string | null } | null {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.searchParams.get("action") !== "scan") return null;
    const tenantId = url.searchParams.get("id_cliente");
    if (!tenantId) return null;
    return { tenantId, centerId: url.searchParams.get("id_centro") };
  } catch {
    return null;
  }
}

function matchesTenantQrPayload(value: string, tenantId: string): boolean {
  const trimmed = value.trim();
  if (trimmed === tenantId) return true;
  const parsed = parseFichajeQrPayload(trimmed);
  return parsed?.tenantId === tenantId;
}

const ESTADO_LEGAL_ANULADO = "Anulado por Corrección";

function localTodayDateKey(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function localMonthStartDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function expandConciliacionRangeForDate(fichajeDateKey: string): { from: string; to: string } {
  const today = localTodayDateKey();
  const monthStart = `${fichajeDateKey.slice(0, 8)}01`;
  return {
    from: monthStart,
    to: fichajeDateKey > today ? fichajeDateKey : today,
  };
}

async function computeDatasetHashSeal(records: unknown): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(records));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type AuditSealedPayload = {
  idProfesor: string;
  nombreProfesor: string;
  rangoDesde: string;
  rangoHasta: string;
  totalRegistros: number;
  registros: FichajeConciliacionAdminRow[];
  hashSello: string;
};

/**
 * Per RD-ley 8/2019, the sealed audit PDF must be generated, hash-chained, and
 * timestamped server-side. The client only posts the reconciled dataset and
 * downloads the signed binary the Edge Function returns — it never fabricates the PDF.
 *
 * `supabase.functions.invoke` attaches the client's locally cached session JWT
 * automatically, so a stale/expired token cached in memory would get sent
 * as-is and the Gateway would reject it with 401. Calling `getSession()`
 * first forces the client to validate (and refresh, if needed) that token
 * before the invocation ever leaves the browser.
 */
async function requestAuditPdfAndDownload(
  payload: AuditSealedPayload | AuditSealedPayload[],
  options?: { downloadFilename?: string },
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Tu sesión ha caducado. Cerrar sesión y volver a entrar.");
  }

  const { data, error } = await supabase.functions.invoke("generar-auditoria-pdf", {
    body: payload,
  });

  if (error) {
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status === 401) {
      throw new Error(
        "No autorizado por el servidor de auditoría. Cerrar sesión y volver a entrar.",
      );
    }
    throw new Error(
      `La función de auditoría falló: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const pdfBlob = data instanceof Blob ? data : null;
  if (!pdfBlob || pdfBlob.size === 0) {
    throw new Error("La función de auditoría no devolvió ningún documento.");
  }

  const referencePayload = Array.isArray(payload) ? payload[0] : payload;
  const filenameSafeProfesor = referencePayload.nombreProfesor.trim().replace(/\s+/g, "_");
  const url = URL.createObjectURL(pdfBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    options?.downloadFilename ??
    `Auditoria_Horaria_${filenameSafeProfesor}_${referencePayload.rangoHasta}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function fichajeRealTimestamp(f: FichajeData): string {
  return f.FECHA_HORA_REAL ?? f.FECHA_HORA;
}

function normalizeServerTimestamp(timestamp: string): string {
  const trimmed = timestamp.trim();
  if (/Z$/i.test(trimmed)) return trimmed;
  if (/[+-]\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  return `${trimmed}Z`;
}

function parseServerDate(timestamp: string | null | undefined): Date | null {
  if (!timestamp?.trim()) return null;
  return new Date(normalizeServerTimestamp(timestamp));
}

function localDateKeyFromServerTimestamp(timestamp: string): string {
  const date = parseServerDate(timestamp);
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateForDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Converts a datetime-local value (browser local) to UTC wall-clock for the DB. */
function localDatetimeToServerTimestamp(localValue: string): string {
  const date = new Date(localValue);
  return date.toISOString().slice(0, 19);
}

function isFichajeAnulado(estadoLegal: string | null | undefined): boolean {
  return estadoLegal === ESTADO_LEGAL_ANULADO;
}

function anuladoRowClass(anulado: boolean): string {
  return anulado ? "line-through text-muted-foreground/60 opacity-60" : "";
}

function formatDesfaseMinutos(minutes: number): string {
  if (minutes === 0) return "0 min";
  const sign = minutes > 0 ? "+" : "";
  return `${sign}${minutes} min`;
}

function todayDateKey(): string {
  return localTodayDateKey();
}

function normalizeMovimiento(mov: string | null | undefined): string {
  return (mov ?? "").trim();
}

function isRecordToday(f: FichajeData): boolean {
  return localDateKeyFromServerTimestamp(fichajeRealTimestamp(f)) === todayDateKey();
}

function formatHorasBlock(hours: number | null): string {
  if (hours == null) return "—";
  return `${hours.toFixed(2)}h`;
}

function deriveClockState(todayRecords: FichajeData[]): {
  state: FicharClockState;
  entradaAt: Date | null;
} {
  const clockRecords = todayRecords.filter(
    (r) =>
      !isFichajeAnulado(r.ESTADO_LEGAL) &&
      CLOCK_MOVEMENT_TYPES.has(normalizeMovimiento(r.TIPO_MOVIMIENTO)),
  );

  if (clockRecords.length === 0) {
    return { state: "out", entradaAt: null };
  }

  const sortedAsc = [...clockRecords].sort((a, b) =>
    fichajeRealTimestamp(a).localeCompare(fichajeRealTimestamp(b)),
  );
  const last = normalizeMovimiento(sortedAsc[sortedAsc.length - 1].TIPO_MOVIMIENTO);

  // Ancla del cronómetro: Entrada de la jornada abierta (tras la última Salida).
  let lastSalidaIdx = -1;
  for (let i = sortedAsc.length - 1; i >= 0; i--) {
    if (normalizeMovimiento(sortedAsc[i].TIPO_MOVIMIENTO) === "Salida") {
      lastSalidaIdx = i;
      break;
    }
  }
  const entradaRecord = sortedAsc
    .slice(lastSalidaIdx + 1)
    .find((r) => normalizeMovimiento(r.TIPO_MOVIMIENTO) === "Entrada");
  const entradaAt = entradaRecord ? parseServerDate(fichajeRealTimestamp(entradaRecord)) : null;

  if (last === "Salida") return { state: "out", entradaAt: null };
  if (last === "Inicio Pausa") return { state: "paused", entradaAt };
  if (last === "Entrada" || last === "Fin de Pausa") {
    return { state: "in", entradaAt };
  }
  return { state: "out", entradaAt: null };
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function toLocalDatetimeValue(iso: string | null | undefined): string {
  if (!iso) {
    return formatDateForDatetimeLocal(new Date());
  }
  const date = parseServerDate(iso);
  if (!date) {
    return formatDateForDatetimeLocal(new Date());
  }
  return formatDateForDatetimeLocal(date);
}

type ManualFichajeStage = "action_type" | "form_entry";
type ManualFichajeAction = "nuevo" | "modificacion";

type ConciliacionJornadaRow = {
  id: string;
  idProfesor: string;
  nombreProfesor: string;
  entrada: FichajeConciliacionAdminRow;
  salida: FichajeConciliacionAdminRow | null;
  totalHoras: number | null;
  estadoTolerancia: "Alerta" | "Correcto";
  anulado: boolean;
};

/** Minimal shape of a row read directly from FICHAJES for a linked correction. */
type LinkedCorrectionRecord = {
  ID_FICHAJE: string;
  TIPO_MOVIMIENTO: string;
  FECHA_HORA: string;
  ESTADO_LEGAL?: string | null;
};

type LinkedConciliacionCorrection = {
  mark: "entrada" | "salida";
  record: LinkedCorrectionRecord;
};

/**
 * The pointer between an 'Anulado por Corrección' row and its replacement is
 * inverse: the anulado row's own `ID_FICHAJE_CORREGIDO` is NULL. It's the
 * NEW correction row that carries `ID_FICHAJE_CORREGIDO` pointing back at
 * the original. So resolving the link means searching FICHAJES for the row
 * whose `ID_FICHAJE_CORREGIDO` equals the anulado row's own `ID_FICHAJE` —
 * not reading `ID_FICHAJE_CORREGIDO` off the anulado row itself.
 */
async function fetchLinkedCorrectionRecord(
  originalFichajeId: string,
): Promise<LinkedCorrectionRecord | null> {
  const { data, error } = await supabase
    .from("FICHAJES")
    .select("*")
    .eq("ID_FICHAJE_CORREGIDO", originalFichajeId)
    .maybeSingle();
  if (error) {
    console.error("No se pudo cargar la corrección vinculada:", error);
    return null;
  }
  return (data as LinkedCorrectionRecord | null) ?? null;
}

async function resolveLinkedCorrectionsForJornada(
  jornada: ConciliacionJornadaRow,
): Promise<LinkedConciliacionCorrection[]> {
  if (!jornada.anulado) return [];

  const marks: { mark: "entrada" | "salida"; originalId: string | null }[] = [
    {
      mark: "entrada",
      originalId: isFichajeAnulado(jornada.entrada.ESTADO_LEGAL)
        ? jornada.entrada.ID_FICHAJE
        : null,
    },
    {
      mark: "salida",
      originalId:
        jornada.salida && isFichajeAnulado(jornada.salida.ESTADO_LEGAL)
          ? jornada.salida.ID_FICHAJE
          : null,
    },
  ];

  const linked: LinkedConciliacionCorrection[] = [];
  for (const { mark, originalId } of marks) {
    if (!originalId) continue;
    const record = await fetchLinkedCorrectionRecord(originalId);
    if (record) {
      linked.push({ mark, record });
    }
  }

  return linked;
}

function formatFechaCorta(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseServerDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatFechaHora(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseServerDate(value);
  if (!date) return "—";
  const datePart = date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timePart = date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${datePart} ${timePart}`;
}

function movimientoBadgeVariant(mov: string | null | undefined) {
  const m = normalizeMovimiento(mov).toLowerCase();
  if (m.includes("corrección pendiente")) return "destructive" as const;
  if (m.includes("corrección aprobada")) return "default" as const;
  if (m === "entrada" || m === "fin de pausa") return "default" as const;
  if (m === "salida") return "secondary" as const;
  return "outline" as const;
}

function ToleranciaBadge({ estado }: { estado: string }) {
  if (estado === "Correcto") {
    return <StatusBadge status="success">{estado}</StatusBadge>;
  }
  if (estado === "Alerta") {
    return (
      <span className="inline-flex items-center rounded-md border border-transparent bg-destructive px-2.5 py-0.5 text-xs font-semibold text-destructive-foreground">
        {estado}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold">
      {estado}
    </span>
  );
}

function conciliacionProfesorNombre(
  row: FichajeConciliacionAdminRow,
  profById: Map<string, string>,
): string {
  return row.NOMBRE_PROFESOR ?? profById.get(row.ID_PROFESOR) ?? row.ID_PROFESOR;
}

type FilterConciliacionRowsOptions = {
  allowedProfIds: Set<string>;
  filtroProfesor: string;
  query: string;
  profById: Map<string, string>;
  filterCenterId?: string | null;
};

function filterConciliacionRows(
  rows: FichajeConciliacionAdminRow[],
  {
    allowedProfIds,
    filtroProfesor,
    query,
    profById,
    filterCenterId,
  }: FilterConciliacionRowsOptions,
): FichajeConciliacionAdminRow[] {
  let result = rows.filter((r) => allowedProfIds.has(r.ID_PROFESOR));
  if (filterCenterId) {
    result = result.filter((r) => r.ID_CENTRO === filterCenterId);
  }
  if (filtroProfesor) {
    result = result.filter((r) => r.ID_PROFESOR === filtroProfesor);
  }
  if (query.trim()) {
    const q = query.toLowerCase();
    result = result.filter((r) => {
      const nombre = conciliacionProfesorNombre(r, profById);
      return (
        nombre.toLowerCase().includes(q) ||
        r.TIPO_MOVIMIENTO.toLowerCase().includes(q) ||
        r.ESTADO_TOLERANCIA.toLowerCase().includes(q) ||
        r.ESTADO_LEGAL.toLowerCase().includes(q)
      );
    });
  }
  return result;
}

function formatConciliacionMarkDetail(mark: FichajeConciliacionAdminRow) {
  return {
    horaReal: mark.HORA_REAL,
    horaTeorica: mark.HORA_TEORICA_IDEAL,
    desfase: formatDesfaseMinutos(mark.DIFERENCIA_MINUTOS),
    tolerancia: mark.ESTADO_TOLERANCIA,
    movimiento: mark.TIPO_MOVIMIENTO,
    id: mark.ID_FICHAJE,
  };
}

function JornadaDetailOverlay({
  open,
  mode,
  jornada,
  linkedCorrections,
  canRectify,
  submitting,
  profesores,
  fichajes,
  formatHora,
  onClose,
  onRectify,
  onCancelRectify,
  onSubmitRectificacion,
}: {
  open: boolean;
  mode: "detail" | "rectify";
  jornada: ConciliacionJornadaRow | null;
  linkedCorrections?: LinkedConciliacionCorrection[];
  canRectify: boolean;
  submitting: boolean;
  profesores: ProfesorLookup[];
  fichajes: FichajeData[];
  formatHora: (fechaHoraReal: string) => string;
  onClose: () => void;
  onRectify: () => void;
  onCancelRectify: () => void;
  onSubmitRectificacion: (values: FichajeCreateInput) => Promise<void>;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "rectify") onCancelRectify();
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, mode, onClose, onCancelRectify]);

  if (!open) return null;

  if (!jornada) {
    return createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/10"
          aria-label="Cerrar"
          onClick={onClose}
        />
        <div
          className={cn(
            ALUMNO_OVERLAY_PANEL_CLASS,
            "max-w-xl flex items-center justify-center p-6",
          )}
        >
          <Skeleton className="h-8 w-48" />
        </div>
      </>,
      document.body,
    );
  }

  const entradaDetail = formatConciliacionMarkDetail(jornada.entrada);
  const salidaDetail = jornada.salida ? formatConciliacionMarkDetail(jornada.salida) : null;
  const fechaJornada = formatFechaHora(jornada.entrada.FECHA_HORA_REAL).split(" ")[0];
  const entradaNotas = fichajes.find((f) => f.ID_FICHAJE === jornada.entrada.ID_FICHAJE)?.NOTAS;
  const salidaNotas = jornada.salida
    ? fichajes.find((f) => f.ID_FICHAJE === jornada.salida?.ID_FICHAJE)?.NOTAS
    : null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/10"
        aria-label="Cerrar detalle de la jornada"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="jornada-overlay-title"
        className={cn(ALUMNO_OVERLAY_PANEL_CLASS, "max-w-xl p-6")}
      >
        {mode === "rectify" ? (
          <>
            <header className={OVERLAY_PANEL_HEADER_CLASS_P6}>
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={onCancelRectify}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver
                </Button>
                <h2 id="jornada-overlay-title" className="truncate text-xl font-semibold">
                  Rectificar fichaje
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
            <ManualFichajeDialog
              open
              embedded
              skipActionPicker
              defaultAction="modificacion"
              initialProfesorId={jornada.idProfesor}
              initialFichajeId={jornada.entrada.ID_FICHAJE}
              profesores={profesores}
              fichajes={fichajes}
              submitting={submitting}
              onClose={onCancelRectify}
              onCancelEdit={onCancelRectify}
              onSubmitNuevo={async () => {}}
              onSubmitModificacion={onSubmitRectificacion}
            />
            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancelRectify}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="brand"
                form="manual-fichaje-rectify-form"
                disabled={submitting}
              >
                {submitting ? "Guardando..." : "Registrar modificación"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className={OVERLAY_PANEL_HEADER_CLASS_P6}>
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="jornada-overlay-title" className="truncate text-xl font-semibold">
                  Vista detalle
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canRectify && (
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    className="gap-2"
                    onClick={onRectify}
                  >
                    <FilePenLine className="h-4 w-4" />
                    Rectificar fichaje
                  </Button>
                )}
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
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <dt className="text-muted-foreground">Profesor</dt>
                <dd className="font-semibold">
                  <EntityLink type="profesor" id={jornada.idProfesor}>
                    {jornada.nombreProfesor}
                  </EntityLink>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fecha</dt>
                <dd>{fechaJornada}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estado</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <ToleranciaBadge estado={jornada.estadoTolerancia} />
                  {jornada.anulado && (
                    <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-[10px] font-semibold">
                      Anulado
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Entrada</dt>
                <dd className="font-medium">{formatHora(jornada.entrada.FECHA_HORA_REAL)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Salida</dt>
                <dd className="font-medium">
                  {jornada.salida ? (
                    formatHora(jornada.salida.FECHA_HORA_REAL)
                  ) : (
                    <span className="text-muted-foreground italic">En curso</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total horas</dt>
                <dd className="font-mono font-semibold">{formatHorasBlock(jornada.totalHoras)}</dd>
              </div>
              <div className="col-span-2 border-t pt-3 mt-1">
                <dt className="text-muted-foreground font-semibold mb-2">Detalle de entrada</dt>
                <dd className="grid grid-cols-2 gap-2 text-xs">
                  <span>
                    <span className="text-muted-foreground">Hora real: </span>
                    {entradaDetail.horaReal}
                  </span>
                  <span>
                    <span className="text-muted-foreground">Hora teórica: </span>
                    {entradaDetail.horaTeorica}
                  </span>
                  <span>
                    <span className="text-muted-foreground">Desfase: </span>
                    {entradaDetail.desfase}
                  </span>
                  <span>
                    <span className="text-muted-foreground">Tolerancia: </span>
                    {entradaDetail.tolerancia}
                  </span>
                  <span className="col-span-2 font-mono text-muted-foreground">
                    ID: {entradaDetail.id}
                  </span>
                </dd>
              </div>
              {salidaDetail && (
                <div className="col-span-2 border-t pt-3">
                  <dt className="text-muted-foreground font-semibold mb-2">Detalle de salida</dt>
                  <dd className="grid grid-cols-2 gap-2 text-xs">
                    <span>
                      <span className="text-muted-foreground">Hora real: </span>
                      {salidaDetail.horaReal}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Hora teórica: </span>
                      {salidaDetail.horaTeorica}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Desfase: </span>
                      {salidaDetail.desfase}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Tolerancia: </span>
                      {salidaDetail.tolerancia}
                    </span>
                    <span className="col-span-2 font-mono text-muted-foreground">
                      ID: {salidaDetail.id}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
            {(fichajeHasIncidencias(entradaNotas) || fichajeHasIncidencias(salidaNotas)) && (
              <div className="mt-4 space-y-2">
                {fichajeHasIncidencias(entradaNotas) && (
                  <FichajeIncidenciasPanel notas={entradaNotas} profesorId={jornada.idProfesor} />
                )}
                {fichajeHasIncidencias(salidaNotas) && (
                  <FichajeIncidenciasPanel notas={salidaNotas} profesorId={jornada.idProfesor} />
                )}
              </div>
            )}
            {jornada.anulado && (
              <div className="mt-4 space-y-2 border-t pt-3">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Correcciones vinculadas
                </h3>
                {linkedCorrections === undefined ? (
                  <Skeleton className="h-14 w-full" />
                ) : linkedCorrections.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No se encontró ninguna corrección vinculada.
                  </p>
                ) : (
                  linkedCorrections.map(({ mark, record }) => (
                    <div
                      key={`${mark}-${record.ID_FICHAJE}`}
                      className="rounded-md border border-amber-200/70 bg-amber-50/60 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-900/20"
                    >
                      <div className="font-medium text-amber-900 dark:text-amber-300">
                        Corrección vinculada ({mark}): {record.TIPO_MOVIMIENTO} a las{" "}
                        {formatHora(record.FECHA_HORA)} —{" "}
                        <EntityLink
                          type="fichaje"
                          id={record.ID_FICHAJE}
                          profesorId={jornada.idProfesor}
                          className="text-sm"
                        >
                          {record.ID_FICHAJE}
                        </EntityLink>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

function FichajeDetailDialog({
  record,
  onClose,
  showProfesor = true,
}: {
  record: FichajeData | null;
  onClose: () => void;
  showProfesor?: boolean;
}) {
  return (
    <Dialog open={!!record} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Clock className="h-5 w-5 text-blue-950" />
            Detalle del fichaje
          </DialogTitle>
          <DialogDescription>Información de solo lectura del registro.</DialogDescription>
        </DialogHeader>
        {record && (
          <div className="space-y-3 text-xs pt-1">
            <div className="bg-muted p-2 rounded font-mono text-[11px] flex justify-between">
              <span>ID: {record.ID_FICHAJE}</span>
              <span className="font-semibold">{record.METODO || "App"}</span>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              {showProfesor && (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Profesor</dt>
                  <dd className="font-bold text-sm">
                    <EntityLink type="profesor" id={record.ID_PROFESOR}>
                      {record.PROFESOR?.NOMBRE_PROFESOR || record.ID_PROFESOR}
                    </EntityLink>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Fecha / Hora</dt>
                <dd className="font-medium">{formatFechaHora(fichajeRealTimestamp(record))}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Movimiento</dt>
                <dd>
                  <Badge className="mt-0.5 capitalize">{record.TIPO_MOVIMIENTO}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Modalidad</dt>
                <dd>{record.MODALIDAD || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ubicación</dt>
                <dd className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {record.UBICACION || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Horas intervalo</dt>
                <dd className="font-mono">
                  {record.TOTAL_HORAS_INTERVALO != null
                    ? `${Number(record.TOTAL_HORAS_INTERVALO).toFixed(2)} h`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Acumulado día</dt>
                <dd className="font-mono font-semibold text-blue-950">
                  {record.TOTAL_HORAS_ACUMULADAS_DIA != null
                    ? `${Number(record.TOTAL_HORAS_ACUMULADAS_DIA).toFixed(2)} h`
                    : "—"}
                </dd>
              </div>
              {record.NOTAS && (
                <div className="col-span-2">
                  {fichajeHasIncidencias(record.NOTAS) ? (
                    <FichajeIncidenciasPanel notas={record.NOTAS} profesorId={record.ID_PROFESOR} />
                  ) : (
                    <>
                      <dt className="text-muted-foreground">Notas</dt>
                      <dd className="mt-0.5 rounded border bg-muted/30 p-2 italic">
                        {record.NOTAS}
                      </dd>
                    </>
                  )}
                </div>
              )}
              {!record.NOTAS && record.ID_FICHAJE_CORREGIDO && (
                <div className="col-span-2">
                  <FichajeIncidenciasPanel
                    notas={`[Vinculo:correccion:${record.ID_FICHAJE_CORREGIDO}]`}
                    profesorId={record.ID_PROFESOR}
                  />
                </div>
              )}
            </dl>
            {(record.ID_FICHAJE_CORREGIDO || record.MODIFICADO_POR) && (
              <div className="border-t pt-2 bg-amber-50/60 p-2.5 rounded border border-amber-200/70 dark:bg-amber-900/20 dark:border-amber-900/40">
                <div className="flex items-center gap-1 text-amber-800 font-semibold text-[11px] dark:text-amber-400">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Registro modificado
                </div>
                <p className="text-[11px] mt-1">Por: {record.MODIFICADO_POR || "Admin"}</p>
                {record.MOTIVO_MODIFICACION && (
                  <p className="text-[11px] mt-1 italic">Motivo: {record.MOTIVO_MODIFICACION}</p>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Printable QR poster (ADMIN)
// ---------------------------------------------------------------------------

function FichajeQrPosterDialog({
  open,
  tenantId,
  centrosOrdenados,
  onClose,
}: {
  open: boolean;
  tenantId: string;
  centrosOrdenados: CentroData[];
  onClose: () => void;
}) {
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const requiresCenterPick = centrosOrdenados.length > 1;
  const canShowQr = Boolean(selectedCenterId);

  useEffect(() => {
    if (!open) return;
    if (centrosOrdenados.length === 1) {
      setSelectedCenterId(centrosOrdenados[0].ID_CENTRO);
    } else {
      setSelectedCenterId(null);
    }
  }, [open, centrosOrdenados]);

  const qrUrl = useMemo(
    () => (selectedCenterId ? buildFichajeQrUrl(tenantId, selectedCenterId) : ""),
    [tenantId, selectedCenterId],
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg print:max-w-none print:border-0 print:bg-white print:p-0 print:shadow-none">
        <div className="print:hidden">
          <DialogHeader>
            <DialogTitle>Cartel de fichaje</DialogTitle>
            <DialogDescription>
              Imprime este cartel y colócalo en el punto de fichaje.
            </DialogDescription>
          </DialogHeader>
        </div>

        {requiresCenterPick && (
          <div className="space-y-1.5 print:hidden">
            <Label htmlFor="qr-poster-centro">Centro</Label>
            <Select value={selectedCenterId ?? ""} onValueChange={setSelectedCenterId}>
              <SelectTrigger id="qr-poster-centro">
                <SelectValue placeholder="Selecciona un centro" />
              </SelectTrigger>
              <SelectContent>
                {centrosOrdenados.map((centro) => (
                  <SelectItem key={centro.ID_CENTRO} value={centro.ID_CENTRO}>
                    {centro.NOMBRE_CENTRO}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div
          id="fichaje-qr-poster"
          className="flex flex-col items-center justify-center gap-6 rounded-lg border bg-white p-8 text-center text-black print:min-h-screen print:gap-10 print:border-0 print:p-12"
        >
          <h2 className="text-3xl font-bold tracking-tight print:text-3xl">Punto de Fichaje</h2>
          {canShowQr ? (
            <div className="rounded-lg bg-white p-4 print:p-6">
              <QRCodeSVG value={qrUrl} size={280} level="M" includeMargin />
            </div>
          ) : (
            <div className="flex h-[280px] w-[280px] items-center justify-center rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
              Selecciona un centro para generar el código QR
            </div>
          )}
          <p className="max-w-sm text-base text-muted-foreground print:max-w-md print:text-xl print:text-black">
            Abre la app y escanea para registrar tu entrada
          </p>
        </div>

        <DialogFooter className="print:hidden">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            type="button"
            variant="brand"
            disabled={!canShowQr}
            onClick={() => window.print()}
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// QR Scanner overlay
// ---------------------------------------------------------------------------

function startJsQrVideoScan(
  video: HTMLVideoElement,
  scanningRef: MutableRefObject<boolean>,
  getCancelled: () => boolean,
  onDetected: (rawValue: string) => void,
): () => void {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return () => {
      scanningRef.current = false;
    };
  }

  let raf = 0;
  scanningRef.current = true;

  const scan = () => {
    if (!scanningRef.current || getCancelled()) return;

    if (video.readyState >= video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
      if (code?.data) {
        scanningRef.current = false;
        cancelAnimationFrame(raf);
        onDetected(code.data);
        return;
      }
    }

    raf = requestAnimationFrame(scan);
  };

  raf = requestAnimationFrame(scan);

  return () => {
    scanningRef.current = false;
    cancelAnimationFrame(raf);
  };
}

function QrScannerOverlay({
  open,
  tenantId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  tenantId: string;
  onClose: () => void;
  onSuccess: (centerId: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualId, setManualId] = useState("");
  const scanningRef = useRef(false);

  const validateAndSuccess = useCallback(
    (value: string) => {
      const parsed = parseFichajeQrPayload(value);
      if (parsed && parsed.tenantId === tenantId) {
        onSuccess(parsed.centerId);
        onClose();
        return true;
      }
      if (matchesTenantQrPayload(value, tenantId)) {
        onSuccess(null);
        onClose();
        return true;
      }
      setError("El código no corresponde a esta escuela.");
      return false;
    },
    [tenantId, onSuccess, onClose],
  );

  useEffect(() => {
    if (!open) {
      setError(null);
      setManualId("");
      scanningRef.current = false;
      return;
    }

    let stream: MediaStream | null = null;
    let stopScan: (() => void) | null = null;
    let cancelled = false;

    async function startScanner() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled || !videoRef.current) return;

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        stopScan = startJsQrVideoScan(
          videoRef.current,
          scanningRef,
          () => cancelled,
          (rawValue) => validateAndSuccess(rawValue),
        );
      } catch {
        setError("No se pudo acceder a la cámara. Introduce el ID de escuela manualmente.");
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      scanningRef.current = false;
      stopScan?.();
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open, validateAndSuccess]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Escanear QR de la escuela
          </DialogTitle>
          <DialogDescription>
            Apunta la cámara al código QR del centro. Debe coincidir con el tenant activo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative aspect-square overflow-hidden rounded-lg border bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs text-muted-foreground">Alternativa manual (ID_CLIENTE)</Label>
            <div className="flex gap-2">
              <Input
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder={tenantId}
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" onClick={() => validateAndSuccess(manualId)}>
                Validar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Fichar tab
// ---------------------------------------------------------------------------

function FicharView({
  fichajes,
  profesorId,
  tenantId,
  isLoading,
  isPending,
  isCorrectionPending,
  onClockAction,
  onRequestCorrection,
}: {
  fichajes: FichajeData[];
  profesorId: string | null;
  tenantId: string;
  isLoading: boolean;
  isPending: boolean;
  isCorrectionPending: boolean;
  onClockAction: (input: FichajeSealedCreateInput) => Promise<void>;
  onRequestCorrection: (
    record: FichajeData,
    values: { fechaHoraManual: string; motivo: string },
  ) => Promise<void>;
}) {
  const [qrOpen, setQrOpen] = useState(false);
  const [viewing, setViewing] = useState<FichajeData | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<FichajeData | null>(null);
  const [now, setNow] = useState(Date.now());

  const ownRecords = useMemo(
    () => (profesorId ? fichajes.filter((f) => f.ID_PROFESOR === profesorId) : []),
    [fichajes, profesorId],
  );

  const todayRecords = useMemo(() => ownRecords.filter((f) => isRecordToday(f)), [ownRecords]);

  const { state, entradaAt } = useMemo(() => deriveClockState(todayRecords), [todayRecords]);

  useEffect(() => {
    if (state === "out" || !entradaAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state, entradaAt]);

  const elapsedLabel =
    entradaAt && state !== "out" ? formatElapsed(now - entradaAt.getTime()) : "00:00:00";

  const insertMovement = async (
    tipo: string,
    metodo: string,
    successMessage: string,
    modalidad = "Presencial",
    centerId: string | null = null,
  ) => {
    if (!profesorId) {
      toast.error("No tienes un profesor vinculado a tu perfil.");
      return;
    }

    try {
      const compliance = await collectFichajeComplianceMetadata();
      await onClockAction({
        ID_PROFESOR: profesorId,
        TIPO_MOVIMIENTO: tipo,
        METODO: metodo,
        MODALIDAD: modalidad,
        ID_CENTRO: centerId,
        IP_FICHAJE: compliance.IP_FICHAJE,
        USER_AGENT: compliance.USER_AGENT,
        LATITUD_LONGITUD: compliance.LATITUD_LONGITUD,
      });
      toast.success(successMessage);
    } catch (err) {
      toast.error(formatFichajeErrorMessage(err));
    }
  };

  const handleQrSuccess = async (centerId: string | null) => {
    await insertMovement(
      "Entrada",
      "QR",
      "Entrada registrada correctamente.",
      "Presencial",
      centerId,
    );
  };

  if (!profesorId) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Tu usuario no tiene un <span className="font-mono">ID_PROFESOR</span> vinculado. Contacta
          con administración para poder fichar.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="flex flex-col items-center gap-6 text-center">
            {state !== "out" && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tiempo transcurrido hoy
                </p>
                <p className="font-mono text-4xl font-bold tabular-nums tracking-tight">
                  {elapsedLabel}
                </p>
                {state === "paused" && <StatusBadge status="pending">En pausa</StatusBadge>}
              </div>
            )}

            {state === "out" && (
              <Button
                variant="brand"
                size="lg"
                className="h-14 px-8 text-base gap-2"
                disabled={isPending}
                onClick={() => setQrOpen(true)}
              >
                <QrCode className="h-5 w-5" />
                Escanear QR para Entrar
              </Button>
            )}

            {state === "in" && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2"
                  disabled={isPending}
                  onClick={() => void insertMovement("Inicio Pausa", "App", "Pausa iniciada.")}
                >
                  <Pause className="h-4 w-4" />
                  Pausa
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  className="gap-2"
                  disabled={isPending}
                  onClick={() => void insertMovement("Salida", "App", "Jornada finalizada.")}
                >
                  <Square className="h-4 w-4" />
                  Fin Jornada
                </Button>
              </div>
            )}

            {state === "paused" && (
              <Button
                variant="brand"
                size="lg"
                className="h-14 px-8 text-base gap-2"
                disabled={isPending}
                onClick={() => void insertMovement("Fin de Pausa", "App", "Jornada reanudada.")}
              >
                <Play className="h-4 w-4" />
                Continuar
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Mi historial de fichajes</h2>
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 text-xs font-semibold">Fecha / Hora</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Movimiento</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Método</TableHead>
                <TableHead className="h-9 text-xs font-semibold text-right">Acumulado</TableHead>
                <TableHead className="h-9 text-xs font-semibold text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5} className="py-2">
                      <Skeleton className="h-7 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : ownRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Aún no tienes fichajes registrados.
                  </TableCell>
                </TableRow>
              ) : (
                ownRecords.slice(0, 20).map((f) => {
                  const showCorrection = canRequestCorrection(f, ownRecords);
                  const anulado = isFichajeAnulado(f.ESTADO_LEGAL);
                  return (
                    <TableRow
                      key={f.ID_FICHAJE}
                      className={`cursor-pointer hover:bg-muted/50 transition-colors ${anuladoRowClass(anulado)}`}
                      onClick={() => setViewing(f)}
                    >
                      <TableCell className="py-2 text-sm font-medium">
                        <div className="flex items-center gap-2">
                          {formatFechaHora(fichajeRealTimestamp(f))}
                          {anulado && (
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              Anulado
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant={movimientoBadgeVariant(f.TIPO_MOVIMIENTO)}
                          className="text-[10px] capitalize"
                        >
                          {f.TIPO_MOVIMIENTO}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">
                        {f.METODO ?? "—"}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs">
                        {f.TOTAL_HORAS_ACUMULADAS_DIA != null
                          ? `${Number(f.TOTAL_HORAS_ACUMULADAS_DIA).toFixed(2)}h`
                          : "—"}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        {showCorrection && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCorrectionTarget(f);
                            }}
                          >
                            Solicitar Corrección
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <ul className="divide-y md:hidden">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="p-3">
                <Skeleton className="h-20 w-full rounded-lg" />
              </li>
            ))
          ) : ownRecords.length === 0 ? (
            <li className="py-8 text-center text-sm text-muted-foreground">
              Aún no tienes fichajes registrados.
            </li>
          ) : (
            ownRecords.slice(0, 20).map((f) => {
              const showCorrection = canRequestCorrection(f, ownRecords);
              const anulado = isFichajeAnulado(f.ESTADO_LEGAL);

              return (
                <li
                  key={f.ID_FICHAJE}
                  className={cn("flex items-stretch gap-1", anuladoRowClass(anulado))}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50"
                    aria-label={`Ver fichaje ${f.TIPO_MOVIMIENTO}`}
                    onClick={() => setViewing(f)}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">
                          {formatFechaHora(fichajeRealTimestamp(f))}
                        </p>
                        {anulado && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            Anulado
                          </Badge>
                        )}
                      </div>
                      <Badge
                        variant={movimientoBadgeVariant(f.TIPO_MOVIMIENTO)}
                        className="text-[10px] capitalize"
                      >
                        {f.TIPO_MOVIMIENTO}
                      </Badge>
                      <p className="text-xs text-muted-foreground">{f.METODO ?? "—"}</p>
                      <p className="font-mono text-xs">
                        {f.TOTAL_HORAS_ACUMULADAS_DIA != null
                          ? `${Number(f.TOTAL_HORAS_ACUMULADAS_DIA).toFixed(2)}h acumuladas`
                          : "—"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                  {showCorrection ? (
                    <div className="flex shrink-0 items-center pr-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setCorrectionTarget(f)}
                      >
                        Solicitar Corrección
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </Card>

      <QrScannerOverlay
        open={qrOpen}
        tenantId={tenantId}
        onClose={() => setQrOpen(false)}
        onSuccess={(centerId) => void handleQrSuccess(centerId)}
      />

      <FichajeDetailDialog record={viewing} onClose={() => setViewing(null)} showProfesor={false} />

      <CorrectionRequestDialog
        open={!!correctionTarget}
        record={correctionTarget}
        submitting={isCorrectionPending}
        onClose={() => setCorrectionTarget(null)}
        onSubmit={async (values) => {
          if (!correctionTarget) return;
          await onRequestCorrection(correctionTarget, values);
          setCorrectionTarget(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Control Horario tab
// ---------------------------------------------------------------------------

function ControlHorarioView({
  canManual,
  canGenerateQrPoster,
  canGenerateAuditoria,
  tenantId,
  initialProfesorId,
  highlightFichajeId,
}: {
  canManual: boolean;
  canGenerateQrPoster: boolean;
  canGenerateAuditoria: boolean;
  tenantId: string;
  initialProfesorId?: string | null;
  highlightFichajeId?: string;
}) {
  const { rol } = useActiveTenant();
  const qc = useQueryClient();
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const { list, create, respondCorrection } = useFichajes(filterCenterId);
  const { list: avisosList } = useAvisosInternos();
  const [fromDate, setFromDate] = useState(localMonthStartDateKey);
  const [toDate, setToDate] = useState(localTodayDateKey);
  const conciliacion = useFichajesConciliacionAdmin(fromDate, toDate);
  const [correctionRejectDialog, setCorrectionRejectDialog] = useState<{
    idFichaje: string;
    mensaje: string;
  } | null>(null);
  const [correctionRejectMotivo, setCorrectionRejectMotivo] = useState("");

  const handleManualSubmit = async (input: FichajeCreateInput, successMessage: string) => {
    try {
      await create.mutateAsync(input);
      await qc.invalidateQueries({
        queryKey: tenantListKey("fichajes-conciliacion-admin", rol, tenantId),
      });
      toast.success(successMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar.");
      throw err;
    }
  };

  const profesores = useMemo(() => list.data?.profesores ?? [], [list.data?.profesores]);
  const fichajesHistorial = useMemo(() => list.data?.fichajes ?? [], [list.data?.fichajes]);
  const fichajeJornadaLookupId = useMemo(() => {
    if (!highlightFichajeId) return null;
    const row = fichajesHistorial.find((f) => f.ID_FICHAJE === highlightFichajeId);
    if (row?.TIPO_MOVIMIENTO?.trim() === CORRECCION_PENDIENTE && row.ID_FICHAJE_CORREGIDO?.trim()) {
      return row.ID_FICHAJE_CORREGIDO.trim();
    }
    return highlightFichajeId;
  }, [highlightFichajeId, fichajesHistorial]);
  const pendingCorreccionesAvisos = useMemo(() => {
    return (avisosList.data ?? []).filter((aviso) => {
      if (aviso.LEIDO !== false) return false;
      if ((aviso.TIPO?.trim() ?? "") !== "Corrección de fichaje pendiente") return false;
      if (filterCenterId && aviso.ID_CENTRO !== filterCenterId) return false;
      return true;
    });
  }, [avisosList.data, filterCenterId]);
  const conciliacionRows = useMemo(() => conciliacion.data ?? [], [conciliacion.data]);
  const isLoading = conciliacion.isLoading;
  const isPending = create.isPending || respondCorrection.isPending;
  const [query, setQuery] = useState("");
  const [filtroProfesor, setFiltroProfesor] = useState(initialProfesorId ?? "");
  const [manualOpen, setManualOpen] = useState(false);
  const [qrPosterOpen, setQrPosterOpen] = useState(false);

  useEffect(() => {
    if (initialProfesorId) setFiltroProfesor(initialProfesorId);
  }, [initialProfesorId]);

  useEffect(() => {
    deepLinkHandledRef.current = null;
  }, [highlightFichajeId]);

  useEffect(() => {
    if (!highlightFichajeId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("V_HISTORIAL_FICHAJES_LEGAL")
        .select("FECHA_HORA_REAL, ID_PROFESOR")
        .eq("ID_FICHAJE", highlightFichajeId)
        .maybeSingle();
      if (cancelled || error || !data?.FECHA_HORA_REAL) return;
      const fichajeDate = data.FECHA_HORA_REAL.slice(0, 10);
      const range = expandConciliacionRangeForDate(fichajeDate);
      setFromDate(range.from);
      setToDate(range.to);
      if (data.ID_PROFESOR) setFiltroProfesor(data.ID_PROFESOR);
    })();
    return () => {
      cancelled = true;
    };
  }, [highlightFichajeId]);

  const [overlay, setOverlay] = useState<{
    id: string;
    mode: "detail" | "rectify";
    linkedCorrections?: LinkedConciliacionCorrection[];
  } | null>(null);
  const deepLinkHandledRef = useRef<string | null>(null);
  const highlightRowRef = useRef<HTMLElement | null>(null);

  const handleCloseOverlay = useCallback(() => setOverlay(null), []);
  const handleRectifyOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "rectify" } : null));
  }, []);
  const handleCancelRectifyOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "detail" } : null));
  }, []);

  const handleJornadaRowClick = useCallback(async (jornada: ConciliacionJornadaRow) => {
    setOverlay({ id: jornada.id, mode: "detail", linkedCorrections: undefined });
    const linkedCorrections = await resolveLinkedCorrectionsForJornada(jornada);
    setOverlay((prev) => (prev && prev.id === jornada.id ? { ...prev, linkedCorrections } : prev));
  }, []);

  const handleAcceptCorrection = useCallback(
    async (idFichaje: string) => {
      try {
        await respondCorrection.mutateAsync({ idFichaje, acepta: true });
        toast.success("Corrección autorizada.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo autorizar la corrección.");
      }
    },
    [respondCorrection],
  );

  const handleRejectCorrection = useCallback(async () => {
    if (!correctionRejectDialog) return;
    const motivo = correctionRejectMotivo.trim();
    if (!motivo) {
      toast.error("Indica el motivo del rechazo.");
      return;
    }
    try {
      await respondCorrection.mutateAsync({
        idFichaje: correctionRejectDialog.idFichaje,
        acepta: false,
        motivo,
      });
      toast.success("Corrección rechazada.");
      setCorrectionRejectDialog(null);
      setCorrectionRejectMotivo("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo rechazar la corrección.");
    }
  }, [correctionRejectDialog, correctionRejectMotivo, respondCorrection]);

  const profById = useMemo(
    () => new Map(profesores.map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR])),
    [profesores],
  );

  const allowedProfIds = useMemo(() => new Set(profesores.map((p) => p.ID_PROFESOR)), [profesores]);

  const [auditGenerating, setAuditGenerating] = useState(false);

  const handleGenerarAuditoria = useCallback(async () => {
    setAuditGenerating(true);
    try {
      const rows = await fetchConciliacionAdminRange(tenantId, fromDate, toDate);
      const auditRows = filterConciliacionRows(rows, {
        allowedProfIds,
        filtroProfesor,
        query,
        profById,
        filterCenterId,
      });

      const buildSealedPayload = async (
        idProfesor: string,
        records: FichajeConciliacionAdminRow[],
      ) => {
        // 2. Ordenar cronológicamente en el cliente
        const registrosCronologicos = [...records].sort((a, b) =>
          a.FECHA_HORA_REAL.localeCompare(b.FECHA_HORA_REAL),
        );

        // 3. ENRIQUECIMIENTO CRIMINALÍSTICO: Cruzar con el historial máster para recuperar Hashes y Métodos reales
        const registrosEnriquecidos = registrosCronologicos.map((row) => {
          // Buscamos correspondencia exacta por ID_FICHAJE en la caché máster del componente
          const dbMatch = fichajesHistorial.find((f) => f.ID_FICHAJE === row.ID_FICHAJE);

          return {
            ...row,
            HASH_INMUTABILIDAD: dbMatch?.HASH_INMUTABILIDAD || null,
            METODO: dbMatch?.METODO || row.METODO || "App",
            TOTAL_HORAS_JORNADA: row.TOTAL_HORAS_INTERVALO
              ? parseFloat(String(row.TOTAL_HORAS_INTERVALO))
              : null,
          };
        });

        const hashSello = await computeDatasetHashSeal(registrosEnriquecidos);

        return {
          idProfesor,
          nombreProfesor: conciliacionProfesorNombre(registrosEnriquecidos[0], profById),
          rangoDesde: fromDate,
          rangoHasta: toDate,
          totalRegistros: registrosEnriquecidos.length,
          registros: registrosEnriquecidos,
          hashSello,
        };
      };

      // Flujo de generación para un único profesor seleccionado en el filtro
      if (filtroProfesor) {
        if (auditRows.length === 0) {
          toast.error(
            `No hay fichajes del ${fromDate} al ${toDate} para este profesor con los filtros aplicados.`,
          );
          return;
        }
        const payload = await buildSealedPayload(filtroProfesor, auditRows);
        await requestAuditPdfAndDownload(payload);
        toast.success("Auditoría sellada y totalizada generada para el profesor.");
        return;
      }

      // Flujo masivo por lotes si no hay filtro de profesor seleccionado
      const byProfesor = new Map<string, FichajeConciliacionAdminRow[]>();
      for (const row of auditRows) {
        const group = byProfesor.get(row.ID_PROFESOR) ?? [];
        group.push(row);
        byProfesor.set(row.ID_PROFESOR, group);
      }

      if (byProfesor.size === 0) {
        toast.error(`No hay fichajes del ${fromDate} al ${toDate} con los filtros aplicados.`);
        return;
      }

      const tenantSafe = tenantId.replace(/[^\w-]+/g, "_");
      const payloads: AuditSealedPayload[] = [];
      for (const [idProfesor, records] of byProfesor) {
        payloads.push(await buildSealedPayload(idProfesor, records));
      }

      await requestAuditPdfAndDownload(payloads, {
        downloadFilename: `Auditoria_Horaria_${tenantSafe}_${toDate}.pdf`,
      });
      toast.success(
        payloads.length === 1
          ? "Auditoría sellada y totalizada generada para el profesor."
          : `Auditoría combinada descargada para ${payloads.length} profesores.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error crítico de extracción.");
    } finally {
      setAuditGenerating(false);
    }
  }, [
    tenantId,
    fromDate,
    toDate,
    filtroProfesor,
    profById,
    fichajesHistorial,
    allowedProfIds,
    query,
    filterCenterId,
  ]);

  const filtered = useMemo(
    () =>
      filterConciliacionRows(conciliacionRows, {
        allowedProfIds,
        filtroProfesor,
        query,
        profById,
        filterCenterId,
      }),
    [conciliacionRows, filtroProfesor, query, profById, allowedProfIds, filterCenterId],
  );

  const formatConciliacionHoraReal = (fechaHoraReal: string) => {
    const date = parseServerDate(fechaHoraReal);
    if (!date) return "—";
    return date.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const jornadas = useMemo(() => {
    const byProfesor = new Map<string, FichajeConciliacionAdminRow[]>();
    for (const row of filtered) {
      const group = byProfesor.get(row.ID_PROFESOR) ?? [];
      group.push(row);
      byProfesor.set(row.ID_PROFESOR, group);
    }

    const blocks: ConciliacionJornadaRow[] = [];

    for (const [idProfesor, marks] of byProfesor) {
      const sorted = [...marks].sort((a, b) => a.FECHA_HORA_REAL.localeCompare(b.FECHA_HORA_REAL));

      let openEntrada: FichajeConciliacionAdminRow | null = null;

      const pushBlock = (
        entrada: FichajeConciliacionAdminRow,
        salida: FichajeConciliacionAdminRow | null,
      ) => {
        const inicioAt = parseServerDate(entrada.FECHA_HORA_REAL);
        const finAt = salida ? parseServerDate(salida.FECHA_HORA_REAL) : null;
        const totalHoras =
          inicioAt && finAt ? (finAt.getTime() - inicioAt.getTime()) / 3_600_000 : null;
        const hasAlerta =
          entrada.ESTADO_TOLERANCIA === "Alerta" || salida?.ESTADO_TOLERANCIA === "Alerta";

        blocks.push({
          id: salida ? `${entrada.ID_FICHAJE}-${salida.ID_FICHAJE}` : `${entrada.ID_FICHAJE}-open`,
          idProfesor,
          nombreProfesor: conciliacionProfesorNombre(entrada, profById),
          entrada,
          salida,
          totalHoras,
          estadoTolerancia: hasAlerta ? "Alerta" : "Correcto",
          anulado:
            isFichajeAnulado(entrada.ESTADO_LEGAL) ||
            (salida ? isFichajeAnulado(salida.ESTADO_LEGAL) : false),
        });
      };

      for (const mark of sorted) {
        const mov = normalizeMovimiento(mark.TIPO_MOVIMIENTO);
        if (mov === "Entrada") {
          if (openEntrada) {
            pushBlock(openEntrada, null);
          }
          openEntrada = mark;
        } else if (mov === "Salida" && openEntrada) {
          pushBlock(openEntrada, mark);
          openEntrada = null;
        }
      }

      if (openEntrada) {
        pushBlock(openEntrada, null);
      }
    }

    return blocks.sort((a, b) =>
      b.entrada.FECHA_HORA_REAL.localeCompare(a.entrada.FECHA_HORA_REAL),
    );
  }, [filtered, profById]);

  const overlayJornada = useMemo(
    () => jornadas.find((j) => j.id === overlay?.id) ?? null,
    [jornadas, overlay?.id],
  );

  useEffect(() => {
    if (!highlightFichajeId || !fichajeJornadaLookupId || conciliacion.isLoading) return;
    if (deepLinkHandledRef.current === highlightFichajeId) return;

    const match = jornadas.find(
      (j) =>
        j.entrada.ID_FICHAJE === fichajeJornadaLookupId ||
        j.salida?.ID_FICHAJE === fichajeJornadaLookupId,
    );
    if (!match) return;

    deepLinkHandledRef.current = highlightFichajeId;
    setOverlay({ id: match.id, mode: "detail", linkedCorrections: undefined });
    void resolveLinkedCorrectionsForJornada(match).then((linkedCorrections) => {
      setOverlay((prev) => (prev && prev.id === match.id ? { ...prev, linkedCorrections } : prev));
    });
  }, [highlightFichajeId, fichajeJornadaLookupId, jornadas, conciliacion.isLoading]);

  useEffect(() => {
    if (!highlightFichajeId || !highlightRowRef.current) return;
    highlightRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightFichajeId, jornadas]);

  const tableColCount = canManual ? 7 : 6;

  const openJornadaRectify = useCallback((jornada: ConciliacionJornadaRow) => {
    setOverlay({ id: jornada.id, mode: "rectify", linkedCorrections: undefined });
    void resolveLinkedCorrectionsForJornada(jornada).then((linkedCorrections) => {
      setOverlay((prev) => (prev && prev.id === jornada.id ? { ...prev, linkedCorrections } : prev));
    });
  }, []);

  const renderJornadaActionsMenu = (jornada: ConciliacionJornadaRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Acciones de la jornada">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openJornadaRectify(jornada)}>Rectificar</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderJornadaMobileCard = (jornada: ConciliacionJornadaRow) => {
    const isHighlighted =
      Boolean(highlightFichajeId) &&
      (jornada.entrada.ID_FICHAJE === highlightFichajeId ||
        jornada.salida?.ID_FICHAJE === highlightFichajeId ||
        jornada.entrada.ID_FICHAJE === fichajeJornadaLookupId ||
        jornada.salida?.ID_FICHAJE === fichajeJornadaLookupId);
    const entradaNotas = fichajesHistorial.find(
      (f) => f.ID_FICHAJE === jornada.entrada.ID_FICHAJE,
    )?.NOTAS;
    const salidaNotas = jornada.salida
      ? fichajesHistorial.find((f) => f.ID_FICHAJE === jornada.salida?.ID_FICHAJE)?.NOTAS
      : null;
    const rowHasIncidencias =
      fichajeHasIncidencias(entradaNotas) || fichajeHasIncidencias(salidaNotas);

    return (
      <li
        key={jornada.id}
        ref={isHighlighted ? highlightRowRef : undefined}
        className={cn(
          "flex items-stretch gap-1",
          anuladoRowClass(jornada.anulado),
          isHighlighted && "bg-primary/5 ring-2 ring-primary/40",
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50"
          aria-label={`Ver jornada de ${jornada.nombreProfesor}`}
          onClick={() => void handleJornadaRowClick(jornada)}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold">{jornada.nombreProfesor}</p>
              {jornada.anulado && (
                <Badge variant="outline" className="text-[10px] shrink-0">Anulado</Badge>
              )}
              {rowHasIncidencias && (
                <Badge variant="destructive" className="text-[10px] shrink-0">Incidencia</Badge>
              )}
            </div>
            <p className="text-sm font-medium">
              {formatFechaCorta(jornada.entrada.FECHA_HORA_REAL)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatConciliacionHoraReal(jornada.entrada.FECHA_HORA_REAL)}
              {" – "}
              {jornada.salida
                ? formatConciliacionHoraReal(jornada.salida.FECHA_HORA_REAL)
                : "En curso"}
            </p>
            <p className="font-mono text-sm">{formatHorasBlock(jornada.totalHoras)}</p>
            <ToleranciaBadge estado={jornada.estadoTolerancia} />
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
        {canManual ? (
          <div
            className="flex shrink-0 items-center pr-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {renderJornadaActionsMenu(jornada)}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {pendingCorreccionesAvisos.length > 0 && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Correcciones pendientes de revisión</h2>
          {pendingCorreccionesAvisos.map((aviso) => {
            const idFichaje = aviso.ID_FICHAJE?.trim() ?? "";
            const highlighted = Boolean(highlightFichajeId && idFichaje === highlightFichajeId);
            return (
              <div
                key={aviso.ID_AVISO}
                className={cn(
                  "rounded-md border p-3 space-y-2",
                  highlighted && "border-primary ring-2 ring-primary/30",
                )}
              >
                <p className="text-sm">{aviso.MENSAJE}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="brand"
                    disabled={isPending || !idFichaje}
                    onClick={() => void handleAcceptCorrection(idFichaje)}
                  >
                    Autorizar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending || !idFichaje}
                    onClick={() => {
                      setCorrectionRejectMotivo("");
                      setCorrectionRejectDialog({
                        idFichaje,
                        mensaje: aviso.MENSAJE ?? "",
                      });
                    }}
                  >
                    Rechazar
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {jornadas.length} jornada{jornadas.length === 1 ? "" : "s"} del {fromDate} al {toDate}
        </p>
        {(canGenerateQrPoster || canGenerateAuditoria || canManual) && (
          <div className="flex flex-wrap gap-2">
            {canGenerateQrPoster && (
              <Button type="button" variant="brand-outline" onClick={() => setQrPosterOpen(true)}>
                <QrCode className="mr-2 h-4 w-4" />
                Generar Cartel QR
              </Button>
            )}
            {canGenerateAuditoria && (
              <Button
                type="button"
                variant="brand-outline"
                disabled={auditGenerating}
                onClick={() => void handleGenerarAuditoria()}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                {auditGenerating ? "Generando..." : "Generar Auditoría"}
              </Button>
            )}
            {canManual && (
              <Button type="button" variant="brand" onClick={() => setManualOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Fichaje Manual
              </Button>
            )}
          </div>
        )}
      </div>

      {conciliacion.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar conciliación: {(conciliacion.error as Error)?.message}
        </div>
      )}

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="fichajes-search">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="fichajes-search"
                placeholder="Profesor, movimiento..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          {showCentroFilter && (
            <div className="flex-1 min-w-[200px]">
              <CentroTableFilter
                id="fichajes-centro-filter"
                centros={centrosOrdenados}
                value={selectedCenterId}
                onChange={setSelectedCenterId}
              />
            </div>
          )}
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="fichajes-profesor-filter">Profesor</Label>
            <Select
              value={filtroProfesor || ALL_VALUE}
              onValueChange={(v) => setFiltroProfesor(v === ALL_VALUE ? "" : v)}
            >
              <SelectTrigger id="fichajes-profesor-filter" className="w-full">
                <SelectValue placeholder="Todos los profesores" className="truncate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Todos los profesores</SelectItem>
                {profesores.map((p) => (
                  <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR} className="truncate">
                    {p.NOMBRE_PROFESOR}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="fichajes-from-date">Desde</Label>
            <Input
              id="fichajes-from-date"
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="Fecha inicial de conciliación"
            />
          </div>
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="fichajes-to-date">Hasta</Label>
            <Input
              id="fichajes-to-date"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="Fecha final de conciliación"
            />
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 text-xs font-semibold">Profesor</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Fecha</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Entrada</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Salida</TableHead>
                <TableHead className="h-9 text-xs font-semibold text-right">Total Horas</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Estado</TableHead>
                {canManual && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={tableColCount} className="py-2">
                      <Skeleton className="h-7 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : jornadas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={tableColCount}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Sin jornadas de conciliación en el rango seleccionado.
                  </TableCell>
                </TableRow>
              ) : (
                jornadas.map((jornada) => {
                  const isHighlighted =
                    Boolean(highlightFichajeId) &&
                    (jornada.entrada.ID_FICHAJE === highlightFichajeId ||
                      jornada.salida?.ID_FICHAJE === highlightFichajeId ||
                      jornada.entrada.ID_FICHAJE === fichajeJornadaLookupId ||
                      jornada.salida?.ID_FICHAJE === fichajeJornadaLookupId);
                  const entradaNotas = fichajesHistorial.find(
                    (f) => f.ID_FICHAJE === jornada.entrada.ID_FICHAJE,
                  )?.NOTAS;
                  const salidaNotas = jornada.salida
                    ? fichajesHistorial.find((f) => f.ID_FICHAJE === jornada.salida?.ID_FICHAJE)
                        ?.NOTAS
                    : null;
                  const rowHasIncidencias =
                    fichajeHasIncidencias(entradaNotas) || fichajeHasIncidencias(salidaNotas);

                  return (
                    <TableRow
                      key={jornada.id}
                      ref={isHighlighted ? highlightRowRef : undefined}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50",
                        anuladoRowClass(jornada.anulado),
                        isHighlighted && "bg-primary/5 ring-2 ring-primary/40",
                      )}
                      onClick={() => void handleJornadaRowClick(jornada)}
                    >
                      <TableCell className="py-2 text-sm font-semibold">
                        <EntityLink type="profesor" id={jornada.idProfesor}>
                          {jornada.nombreProfesor}
                        </EntityLink>
                        {jornada.anulado && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            Anulado
                          </Badge>
                        )}
                        {rowHasIncidencias && (
                          <Badge variant="destructive" className="ml-2 text-[10px]">
                            Incidencia
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-sm font-medium">
                        {formatFechaCorta(jornada.entrada.FECHA_HORA_REAL)}
                      </TableCell>
                      <TableCell className="py-2 text-sm font-medium">
                        {formatConciliacionHoraReal(jornada.entrada.FECHA_HORA_REAL)}
                      </TableCell>
                      <TableCell className="py-2 text-sm font-medium">
                        {jornada.salida ? (
                          formatConciliacionHoraReal(jornada.salida.FECHA_HORA_REAL)
                        ) : (
                          <span className="text-muted-foreground italic">En curso</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-sm">
                        {formatHorasBlock(jornada.totalHoras)}
                      </TableCell>
                      <TableCell className="py-2">
                        <ToleranciaBadge estado={jornada.estadoTolerancia} />
                      </TableCell>
                      {canManual && (
                        <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                          {renderJornadaActionsMenu(jornada)}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <ul className="divide-y md:hidden">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="p-3">
                <Skeleton className="h-24 w-full rounded-lg" />
              </li>
            ))
          ) : jornadas.length === 0 ? (
            <li className="py-10 text-center text-sm text-muted-foreground">
              Sin jornadas de conciliación en el rango seleccionado.
            </li>
          ) : (
            jornadas.map((jornada) => renderJornadaMobileCard(jornada))
          )}
        </ul>
      </Card>

      <JornadaDetailOverlay
        open={!!overlay}
        mode={overlay?.mode ?? "detail"}
        jornada={overlayJornada}
        linkedCorrections={overlay?.linkedCorrections}
        canRectify={canManual}
        submitting={isPending}
        profesores={profesores}
        fichajes={fichajesHistorial}
        formatHora={formatConciliacionHoraReal}
        onClose={handleCloseOverlay}
        onRectify={handleRectifyOverlay}
        onCancelRectify={handleCancelRectifyOverlay}
        onSubmitRectificacion={async (values) => {
          await handleManualSubmit(values, "Modificación de fichaje registrada.");
          setOverlay((prev) => (prev ? { ...prev, mode: "detail" } : null));
        }}
      />

      <ManualFichajeDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        profesores={profesores}
        fichajes={fichajesHistorial}
        submitting={isPending}
        onSubmitNuevo={async (values) => {
          await handleManualSubmit(values, "Fichaje manual registrado.");
          setManualOpen(false);
        }}
        onSubmitModificacion={async (values) => {
          await handleManualSubmit(values, "Modificación de fichaje registrada.");
          setManualOpen(false);
        }}
      />

      {canGenerateQrPoster && (
        <FichajeQrPosterDialog
          open={qrPosterOpen}
          tenantId={tenantId}
          centrosOrdenados={centrosOrdenados}
          onClose={() => setQrPosterOpen(false)}
        />
      )}

      <Dialog
        open={!!correctionRejectDialog}
        onOpenChange={(open) => !open && setCorrectionRejectDialog(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar corrección</DialogTitle>
            <DialogDescription>{correctionRejectDialog?.mensaje}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-rechazo-correccion">Motivo del rechazo *</Label>
            <Textarea
              id="motivo-rechazo-correccion"
              value={correctionRejectMotivo}
              onChange={(e) => setCorrectionRejectMotivo(e.target.value)}
              rows={4}
              placeholder="Explica por qué rechazas esta corrección..."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCorrectionRejectDialog(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending || !correctionRejectMotivo.trim()}
              onClick={() => void handleRejectCorrection()}
            >
              {isPending ? "Guardando..." : "Confirmar rechazo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function ManualFichajeDialog({
  open,
  onClose,
  profesores,
  fichajes,
  submitting,
  onSubmitNuevo,
  onSubmitModificacion,
  embedded,
  skipActionPicker,
  defaultAction,
  initialProfesorId,
  initialFichajeId,
  onCancelEdit,
}: {
  open: boolean;
  onClose: () => void;
  profesores: ProfesorLookup[];
  fichajes: FichajeData[];
  submitting: boolean;
  onSubmitNuevo: (values: FichajeCreateInput) => Promise<void>;
  onSubmitModificacion: (values: FichajeCreateInput) => Promise<void>;
  embedded?: boolean;
  skipActionPicker?: boolean;
  defaultAction?: ManualFichajeAction;
  initialProfesorId?: string;
  initialFichajeId?: string;
  onCancelEdit?: () => void;
}) {
  const [stage, setStage] = useState<ManualFichajeStage>("action_type");
  const [action, setAction] = useState<ManualFichajeAction | null>(null);
  const [idProfesor, setIdProfesor] = useState("");
  const [tipoMovimiento, setTipoMovimiento] = useState<string>("Entrada");
  const [fechaHora, setFechaHora] = useState("");
  const [idFichajeCorregido, setIdFichajeCorregido] = useState("");
  const [motivoModificacion, setMotivoModificacion] = useState("");

  const profesoresActivos = useMemo(
    () => sortProfesoresByNombre(filterProfesoresActivos(profesores)),
    [profesores],
  );

  const fichajesCorregibles = useMemo(() => {
    if (!idProfesor) return [];
    const delProfesor = fichajes.filter((f) => f.ID_PROFESOR === idProfesor);
    const solicitudRows = delProfesor.map((row) => ({
      ID_FICHAJE: row.ID_FICHAJE,
      ID_FICHAJE_CORREGIDO: row.ID_FICHAJE_CORREGIDO,
      TIPO_MOVIMIENTO: row.TIPO_MOVIMIENTO,
      ESTADO: row.ESTADO ?? null,
    }));
    return delProfesor.filter(
      (f) =>
        !isFichajeAnulado(f.ESTADO_LEGAL) &&
        !isCorrectionMovement(f.TIPO_MOVIMIENTO) &&
        canRequestCorrection(
          { ID_FICHAJE: f.ID_FICHAJE, TIPO_MOVIMIENTO: f.TIPO_MOVIMIENTO },
          solicitudRows,
        ),
    );
  }, [fichajes, idProfesor]);

  const resetForm = useCallback(() => {
    setStage("action_type");
    setAction(null);
    setIdProfesor("");
    setTipoMovimiento("Entrada");
    setFechaHora(toLocalDatetimeValue(null));
    setIdFichajeCorregido("");
    setMotivoModificacion("");
  }, []);

  useEffect(() => {
    if (!open) return;
    if (skipActionPicker && defaultAction) {
      setAction(defaultAction);
      setStage("form_entry");
      setIdProfesor(initialProfesorId ?? "");
      setTipoMovimiento("Entrada");
      setIdFichajeCorregido(initialFichajeId ?? "");
      setMotivoModificacion("");
      if (initialFichajeId) {
        const selected = fichajes.find((f) => f.ID_FICHAJE === initialFichajeId);
        setFechaHora(toLocalDatetimeValue(selected ? fichajeRealTimestamp(selected) : null));
      } else {
        setFechaHora(toLocalDatetimeValue(null));
      }
      return;
    }
    resetForm();
  }, [
    open,
    skipActionPicker,
    defaultAction,
    initialProfesorId,
    initialFichajeId,
    fichajes,
    resetForm,
  ]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSelectAction = (next: ManualFichajeAction) => {
    setAction(next);
    setStage("form_entry");
    setIdProfesor("");
    setTipoMovimiento("Entrada");
    setFechaHora(toLocalDatetimeValue(null));
    setIdFichajeCorregido("");
    setMotivoModificacion("");
  };

  const handleProfesorChange = (value: string) => {
    setIdProfesor(value);
    setIdFichajeCorregido("");
    setMotivoModificacion("");
    if (action === "modificacion") {
      setFechaHora(toLocalDatetimeValue(null));
    }
  };

  const handleFichajeCorregidoChange = (value: string) => {
    setIdFichajeCorregido(value);
    const selected = fichajesCorregibles.find((f) => f.ID_FICHAJE === value);
    if (selected) {
      setFechaHora(toLocalDatetimeValue(fichajeRealTimestamp(selected)));
    }
  };

  const complianceNullFields = {
    IP_FICHAJE: null,
    USER_AGENT: null,
    LATITUD_LONGITUD: null,
  } as const;

  const canSubmitNuevo = Boolean(idProfesor && fechaHora && tipoMovimiento);
  const canSubmitModificacion = Boolean(
    idProfesor && idFichajeCorregido && motivoModificacion.trim(),
  );

  const modificacionForm = (
    <form
      id={embedded ? "manual-fichaje-rectify-form" : undefined}
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmitModificacion) return;
        const motivo = motivoModificacion.trim();
        await onSubmitModificacion({
          ID_PROFESOR: idProfesor,
          TIPO_MOVIMIENTO: MODIFICACION_PENDIENTE,
          ID_FICHAJE_CORREGIDO: idFichajeCorregido,
          FECHA_HORA_MANUAL: fechaHora ? localDatetimeToServerTimestamp(fechaHora) : undefined,
          MOTIVO_MODIFICACION: motivo,
          NOTAS: motivo,
          METODO: "Corrección Manual",
          MODALIDAD: "Presencial",
          ...complianceNullFields,
        });
      }}
    >
      <div className="space-y-2">
        <Label>Profesor *</Label>
        <Select value={idProfesor} onValueChange={handleProfesorChange}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar profesor" />
          </SelectTrigger>
          <SelectContent>
            {profesoresActivos.map((p) => (
              <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR}>
                {formatProfesorOptionLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {idProfesor && (
        <div className="space-y-2">
          <Label>Fichaje a corregir *</Label>
          {fichajesCorregibles.length === 0 ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              No hay fichajes válidos para corregir de este profesor.
            </p>
          ) : (
            <Select value={idFichajeCorregido} onValueChange={handleFichajeCorregidoChange}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar fichaje" />
              </SelectTrigger>
              <SelectContent>
                {fichajesCorregibles.map((f) => (
                  <SelectItem key={f.ID_FICHAJE} value={f.ID_FICHAJE}>
                    {formatFechaHora(fichajeRealTimestamp(f))} · {f.TIPO_MOVIMIENTO}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {idFichajeCorregido && (
        <div className="space-y-2">
          <Label>Hora correcta *</Label>
          <Input
            type="datetime-local"
            value={fechaHora}
            onChange={(e) => setFechaHora(e.target.value)}
            required
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="motivo-modificacion">Motivo de la modificación *</Label>
        <Textarea
          id="motivo-modificacion"
          value={motivoModificacion}
          onChange={(e) => setMotivoModificacion(e.target.value)}
          rows={4}
          placeholder="Describe el motivo de la rectificación..."
          required
        />
      </div>

      {!embedded ? (
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="gap-1.5"
            onClick={() => setStage("action_type")}
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={submitting || !canSubmitModificacion}>
              {submitting ? "Guardando..." : "Registrar modificación"}
            </Button>
          </div>
        </DialogFooter>
      ) : null}
    </form>
  );

  if (embedded && skipActionPicker && defaultAction === "modificacion") {
    if (!open) return null;
    return modificacionForm;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {stage === "action_type"
              ? "Fichaje manual"
              : action === "nuevo"
                ? "Nuevo fichaje"
                : "Modificación de fichaje"}
          </DialogTitle>
          <DialogDescription>
            {stage === "action_type"
              ? "Selecciona el tipo de operación que deseas registrar."
              : action === "nuevo"
                ? "Registra una marca de presencia nueva en la línea temporal."
                : "Registra una rectificación sobre un fichaje existente."}
          </DialogDescription>
        </DialogHeader>

        {stage === "action_type" ? (
          <div className="grid gap-3 py-2">
            <Button
              type="button"
              variant="brand-outline"
              className="h-auto justify-start gap-3 px-4 py-4 text-left"
              onClick={() => handleSelectAction("nuevo")}
            >
              <Plus className="h-5 w-5 shrink-0" />
              <span>
                <span className="block font-semibold">Nuevo Fichaje</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  Registra una marca limpia en la línea temporal.
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="brand-outline"
              className="h-auto justify-start gap-3 px-4 py-4 text-left"
              onClick={() => handleSelectAction("modificacion")}
            >
              <FilePenLine className="h-5 w-5 shrink-0" />
              <span>
                <span className="block font-semibold">Modificación de Fichaje Existente</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  Crea una entrada de rectificación en el libro de registro.
                </span>
              </span>
            </Button>
          </div>
        ) : action === "nuevo" ? (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!canSubmitNuevo) return;
              await onSubmitNuevo({
                ID_PROFESOR: idProfesor,
                TIPO_MOVIMIENTO: tipoMovimiento,
                FECHA_HORA: localDatetimeToServerTimestamp(fechaHora),
                METODO: "Manual Web",
                MODALIDAD: "Presencial",
                ...complianceNullFields,
              });
            }}
          >
            <div className="space-y-2">
              <Label>Profesor *</Label>
              <Select value={idProfesor} onValueChange={handleProfesorChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar profesor" />
                </SelectTrigger>
                <SelectContent>
                  {profesoresActivos.map((p) => (
                    <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR}>
                      {formatProfesorOptionLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha y hora *</Label>
              <Input
                type="datetime-local"
                value={fechaHora}
                onChange={(e) => setFechaHora(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de movimiento *</Label>
              <Select value={tipoMovimiento} onValueChange={setTipoMovimiento}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOVIMIENTO_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="gap-1.5"
                onClick={() => setStage("action_type")}
              >
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button type="submit" variant="brand" disabled={submitting || !canSubmitNuevo}>
                  {submitting ? "Guardando..." : "Registrar"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        ) : (
          modificacionForm
        )}

        {stage === "action_type" && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function FichajesAdminPage() {
  const { rol, perfil, tenantId } = useActiveTenant();
  const { session } = useApp();
  const { profesorId: deepLinkProfesorId, fichajeId: deepLinkFichajeId } = Route.useSearch();
  const { list, createSealed, requestCorrection } = useFichajes();

  const fichajes = useMemo(() => list.data?.fichajes ?? [], [list.data?.fichajes]);

  const showControlTab = isMasterRole(rol) || isAdminRole(rol) || isSecretariaRole(rol);
  const canManualFichaje = isMasterRole(rol) || isAdminRole(rol) || isSecretariaRole(rol);
  const canGenerateQrPoster = isMasterRole(rol) || isAdminRole(rol) || isSecretariaRole(rol);
  const canGenerateAuditoria = isMasterRole(rol) || isAdminRole(rol) || isSecretariaRole(rol);

  const [activeTab, setActiveTab] = useState<"fichar" | "control">(
    showControlTab && (deepLinkProfesorId || deepLinkFichajeId) ? "control" : "fichar",
  );

  useEffect(() => {
    if (deepLinkProfesorId || deepLinkFichajeId) {
      setActiveTab("control");
    }
  }, [deepLinkProfesorId, deepLinkFichajeId]);

  const auditRejectedFichaje = (input: FichajeSealedCreateInput, err: unknown) => {
    void logFichajeRejection({
      tenantId,
      idProfesor: input.ID_PROFESOR,
      idUsuario: session?.user?.id ?? null,
      tipoMovimiento: input.TIPO_MOVIMIENTO,
      errorMessage: err instanceof Error ? err.message : String(err),
      attemptedPayload: input as Record<string, unknown>,
    });
  };

  const handleClockAction = async (input: FichajeSealedCreateInput) => {
    try {
      await createSealed.mutateAsync(input);
    } catch (err) {
      auditRejectedFichaje(input, err);
      throw err;
    }
  };

  const handleRequestCorrection = async (
    record: FichajeData,
    values: { fechaHoraManual: string; motivo: string },
  ) => {
    if (!perfil.ID_PROFESOR) {
      toast.error("No tienes un profesor vinculado a tu perfil.");
      return;
    }

    const compliance = await collectFichajeComplianceMetadata();
    const sealedInput: FichajeSealedCreateInput = {
      ID_PROFESOR: perfil.ID_PROFESOR,
      TIPO_MOVIMIENTO: "Corrección Pendiente",
      ID_FICHAJE_CORREGIDO: record.ID_FICHAJE,
      FECHA_HORA_MANUAL: values.fechaHoraManual,
      MOTIVO_MODIFICACION: values.motivo,
      METODO: "Corrección",
      ...compliance,
    };

    try {
      await requestCorrection.mutateAsync({
        idProfesor: perfil.ID_PROFESOR,
        idFichajeCorregido: record.ID_FICHAJE,
        fechaHoraManual: values.fechaHoraManual,
        motivo: values.motivo,
        compliance,
      });
      toast.success("Solicitud de corrección enviada.");
    } catch (err) {
      auditRejectedFichaje(sealedInput, err);
      toast.error(formatFichajeErrorMessage(err));
      throw err;
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title="Fichajes" description="Control de presencia y registro horario" />

      {list.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar fichajes: {(list.error as Error)?.message}
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "fichar" | "control")}
        className="w-full"
      >
        <TabsList
          className={
            showControlTab ? "mb-4 grid w-full max-w-md grid-cols-2" : "mb-4 w-full max-w-xs"
          }
        >
          <TabsTrigger value="fichar">Fichar</TabsTrigger>
          {showControlTab && <TabsTrigger value="control">Control Horario</TabsTrigger>}
        </TabsList>

        <TabsContent value="fichar">
          <FicharView
            fichajes={fichajes}
            profesorId={perfil.ID_PROFESOR}
            tenantId={tenantId}
            isLoading={list.isLoading}
            isPending={createSealed.isPending}
            isCorrectionPending={requestCorrection.isPending}
            onClockAction={handleClockAction}
            onRequestCorrection={handleRequestCorrection}
          />
        </TabsContent>

        {showControlTab && (
          <TabsContent value="control">
            <ControlHorarioView
              canManual={canManualFichaje}
              canGenerateQrPoster={canGenerateQrPoster}
              canGenerateAuditoria={canGenerateAuditoria}
              tenantId={tenantId}
              initialProfesorId={deepLinkProfesorId}
              highlightFichajeId={deepLinkFichajeId}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function FichajesPage() {
  const { rol } = useActiveTenant();
  if (isProfesorRole(rol)) {
    return <Navigate to="/app/fichajes" replace />;
  }
  return <FichajesAdminPage />;
}
