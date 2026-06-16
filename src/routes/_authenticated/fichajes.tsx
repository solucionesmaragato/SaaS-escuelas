import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MutableRefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import jsQR from "jsqr";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  Clock,
  FilePenLine,
  MapPin,
  Pause,
  Play,
  Plus,
  Printer,
  QrCode,
  Search,
  ShieldAlert,
  Square,
  X,
} from "lucide-react";
import { CorrectionRequestDialog } from "@/components/fichajes/CorrectionRequestDialog";
import { collectFichajeComplianceMetadata } from "@/lib/fichajeCompliance";
import { logFichajeRejection } from "@/lib/fichajeAudit";
import {
  canRequestCorrection,
  CLOCK_MOVEMENT_TYPES,
  CORRECCION_APROBADA,
  formatFichajeErrorMessage,
  isCorrectionMovement,
} from "@/lib/fichajeEidas";
import {
  filterProfesoresActivos,
  formatProfesorOptionLabel,
  sortProfesoresByNombre,
} from "@/lib/profesorSelector";
import {
  useFichajes,
  useFichajesConciliacionAdmin,
  useProfesorFichajes,
  type FichajeConciliacionAdminRow,
  type FichajeCreateInput,
  type FichajeData,
  type FichajeSealedCreateInput,
  type ProfesorFichajeCreateInput,
  type ProfesorFichajeRow,
  type ProfesorLookup,
} from "@/hooks/useFichajes";
import { useAdminCentroFilter, type CentroData } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useActiveTenant, useApp } from "@/context/AppContext";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fichajes")({
  component: FichajesPage,
});

const ALL_VALUE = "__all__";
const MOVIMIENTO_OPTIONS = [
  "Entrada",
  "Salida",
  "Inicio Pausa",
  "Fin de Pausa",
] as const;

type ClockState = "out" | "active" | "paused";
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

function isRecordTodayProfesor(f: ProfesorFichajeRow): boolean {
  return localDateKeyFromServerTimestamp(f.FECHA_HORA_REAL) === todayDateKey();
}

function deriveProfesorClockState(todayRecords: ProfesorFichajeRow[]): {
  state: ClockState;
  resumeAt: Date | null;
  pausedAt: Date | null;
} {
  const valid = todayRecords.filter(
    (r) =>
      !isFichajeAnulado(r.ESTADO_LEGAL) &&
      CLOCK_MOVEMENT_TYPES.has(normalizeMovimiento(r.TIPO_MOVIMIENTO)),
  );

  if (valid.length === 0) {
    return { state: "out", resumeAt: null, pausedAt: null };
  }

  const sorted = [...valid].sort((a, b) =>
    b.FECHA_HORA_REAL.localeCompare(a.FECHA_HORA_REAL),
  );
  const last = normalizeMovimiento(sorted[0].TIPO_MOVIMIENTO);

  if (last === "Salida") return { state: "out", resumeAt: null, pausedAt: null };

  if (last === "Inicio Pausa") {
    const pausedAt = parseServerDate(sorted[0].FECHA_HORA_REAL);
    const resumeRecord = sorted.find((r) => {
      const mov = normalizeMovimiento(r.TIPO_MOVIMIENTO);
      return (
        (mov === "Entrada" || mov === "Fin de Pausa") &&
        r.FECHA_HORA_REAL <= sorted[0].FECHA_HORA_REAL
      );
    });
    return {
      state: "paused",
      resumeAt: resumeRecord ? parseServerDate(resumeRecord.FECHA_HORA_REAL) : null,
      pausedAt,
    };
  }

  if (last === "Entrada" || last === "Fin de Pausa") {
    return {
      state: "active",
      resumeAt: parseServerDate(sorted[0].FECHA_HORA_REAL),
      pausedAt: null,
    };
  }

  return { state: "out", resumeAt: null, pausedAt: null };
}

type ShiftBlock = {
  id: string;
  inicio: string;
  fin: string | null;
  totalHoras: number | null;
  anulado: boolean;
};

function buildShiftBlocks(records: ProfesorFichajeRow[]): ShiftBlock[] {
  const clockRecords = records
    .filter((r) => CLOCK_MOVEMENT_TYPES.has(normalizeMovimiento(r.TIPO_MOVIMIENTO)))
    .sort((a, b) => a.FECHA_HORA_REAL.localeCompare(b.FECHA_HORA_REAL));

  const blocks: ShiftBlock[] = [];
  let openStart: ProfesorFichajeRow | null = null;

  for (const record of clockRecords) {
    const mov = normalizeMovimiento(record.TIPO_MOVIMIENTO);
    if (mov === "Entrada" || mov === "Fin de Pausa") {
      openStart = record;
    } else if ((mov === "Inicio Pausa" || mov === "Salida") && openStart) {
      const finAt = parseServerDate(record.FECHA_HORA_REAL);
      const inicioAt = parseServerDate(openStart.FECHA_HORA_REAL);
      const ms =
        finAt && inicioAt ? finAt.getTime() - inicioAt.getTime() : 0;
      blocks.push({
        id: `${openStart.ID_FICHAJE}-${record.ID_FICHAJE}`,
        inicio: openStart.FECHA_HORA_REAL,
        fin: record.FECHA_HORA_REAL,
        totalHoras: ms / 3_600_000,
        anulado:
          isFichajeAnulado(openStart.ESTADO_LEGAL) ||
          isFichajeAnulado(record.ESTADO_LEGAL),
      });
      openStart = null;
    }
  }

  return blocks.reverse();
}

function formatHorasBlock(hours: number | null): string {
  if (hours == null) return "—";
  return `${hours.toFixed(2)}h`;
}

function deriveClockState(todayRecords: FichajeData[]): {
  state: FicharClockState;
  entradaAt: Date | null;
} {
  const clockRecords = todayRecords.filter((r) =>
    CLOCK_MOVEMENT_TYPES.has(normalizeMovimiento(r.TIPO_MOVIMIENTO)),
  );

  if (clockRecords.length === 0) {
    return { state: "out", entradaAt: null };
  }

  const sorted = [...clockRecords].sort((a, b) =>
    fichajeRealTimestamp(b).localeCompare(fichajeRealTimestamp(a)),
  );
  const last = normalizeMovimiento(sorted[0].TIPO_MOVIMIENTO);

  const entradaRecord = [...clockRecords]
    .filter((r) => normalizeMovimiento(r.TIPO_MOVIMIENTO) === "Entrada")
    .sort((a, b) =>
      fichajeRealTimestamp(a).localeCompare(fichajeRealTimestamp(b)),
    )[0];
  const entradaAt = entradaRecord
    ? parseServerDate(fichajeRealTimestamp(entradaRecord))
    : null;

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
    return (
      <Badge className="border-transparent bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
        {estado}
      </Badge>
    );
  }
  if (estado === "Alerta") {
    return <Badge variant="destructive">{estado}</Badge>;
  }
  return <Badge variant="outline">{estado}</Badge>;
}

function conciliacionProfesorNombre(
  row: FichajeConciliacionAdminRow,
  profById: Map<string, string>,
): string {
  return row.NOMBRE_PROFESOR ?? profById.get(row.ID_PROFESOR) ?? row.ID_PROFESOR;
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
                    {record.PROFESOR?.NOMBRE_PROFESOR || record.ID_PROFESOR}
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
                  <dt className="text-muted-foreground">Notas</dt>
                  <dd className="mt-0.5 rounded border bg-muted/30 p-2 italic">
                    {record.NOTAS}
                  </dd>
                </div>
              )}
            </dl>
            {(record.ID_FICHAJE_CORREGIDO || record.MODIFICADO_POR) && (
              <div className="border-t pt-2 bg-amber-50/60 p-2.5 rounded border border-amber-200/70">
                <div className="flex items-center gap-1 text-amber-800 font-semibold text-[11px]">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Registro modificado
                </div>
                <p className="text-[11px] mt-1">
                  Por: {record.MODIFICADO_POR || "Admin"}
                </p>
                {record.MOTIVO_MODIFICACION && (
                  <p className="text-[11px] mt-1 italic">
                    Motivo: {record.MOTIVO_MODIFICACION}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
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
            <Select
              value={selectedCenterId ?? ""}
              onValueChange={setSelectedCenterId}
            >
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
          <h2 className="text-3xl font-bold tracking-tight print:text-5xl">
            Punto de Fichaje
          </h2>
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
          <Button type="button" disabled={!canShowQr} onClick={() => window.print()}>
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
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
            />
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

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs text-muted-foreground">
              Alternativa manual (ID_CLIENTE)
            </Label>
            <div className="flex gap-2">
              <Input
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder={tenantId}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => validateAndSuccess(manualId)}
              >
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
// Inline QR scanner (teacher kiosk)
// ---------------------------------------------------------------------------

function ProfesorQrScanner({
  tenantId,
  onSuccess,
}: {
  tenantId: string;
  onSuccess: (centerId: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const scanningRef = useRef(false);

  const validateAndSuccess = useCallback(
    (value: string) => {
      const parsed = parseFichajeQrPayload(value);
      if (parsed && parsed.tenantId === tenantId) {
        onSuccess(parsed.centerId);
        return true;
      }
      if (matchesTenantQrPayload(value, tenantId)) {
        onSuccess(null);
        return true;
      }
      setError("El código no corresponde a esta escuela.");
      return false;
    },
    [tenantId, onSuccess],
  );

  useEffect(() => {
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
        setError("No se pudo acceder a la cámara.");
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
  }, [validateAndSuccess]);

  return (
    <div className="w-full space-y-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />
      </div>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teacher mobile-first fichajes view
// ---------------------------------------------------------------------------

function ProfesorFichajesView({
  fichajes,
  profesorId,
  centerId,
  tenantId,
  isLoading,
  isPending,
  onClockAction,
}: {
  fichajes: ProfesorFichajeRow[];
  profesorId: string | null;
  centerId: string | null;
  tenantId: string;
  isLoading: boolean;
  isPending: boolean;
  onClockAction: (input: ProfesorFichajeCreateInput) => Promise<void>;
}) {
  const [now, setNow] = useState(Date.now());
  const [desplazamientoOpen, setDesplazamientoOpen] = useState(false);
  const [desplazamientoMotivo, setDesplazamientoMotivo] = useState("");
  const [isFichando, setIsFichando] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const todayRecords = useMemo(
    () => fichajes.filter((f) => isRecordTodayProfesor(f)),
    [fichajes],
  );

  const { state, resumeAt, pausedAt } = useMemo(
    () => deriveProfesorClockState(todayRecords),
    [todayRecords],
  );

  const shiftBlocks = useMemo(() => buildShiftBlocks(fichajes), [fichajes]);

  useEffect(() => {
    if (state !== "active" || !resumeAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state, resumeAt]);

  const elapsedMs = useMemo(() => {
    if (!resumeAt) return 0;
    if (state === "paused" && pausedAt) {
      return pausedAt.getTime() - resumeAt.getTime();
    }
    if (state === "active") {
      return now - resumeAt.getTime();
    }
    return 0;
  }, [state, resumeAt, pausedAt, now]);

  const elapsedLabel = formatElapsed(elapsedMs);

  const insertMovement = async (
    tipo: string,
    metodo: string,
    successMessage: string,
    options: {
      modalidad?: string;
      notas?: string | null;
      centerId?: string | null;
    } = {},
  ) => {
    if (!profesorId) {
      toast.error("No tienes un profesor vinculado a tu perfil.");
      return;
    }

    if (isProcessing) return;

    setIsProcessing(true);
    try {
      const compliance = await collectFichajeComplianceMetadata();
      await onClockAction({
        ID_CLIENTE: tenantId,
        ID_PROFESOR: profesorId,
        TIPO_MOVIMIENTO: tipo,
        METODO: metodo,
        MODALIDAD: options.modalidad ?? "Presencial",
        NOTAS: options.notas ?? null,
        ID_CENTRO: options.centerId ?? centerId ?? null,
        IP_FICHAJE: compliance.IP_FICHAJE,
        USER_AGENT: compliance.USER_AGENT,
        LATITUD_LONGITUD: compliance.LATITUD_LONGITUD,
      });
      toast.success(successMessage);
    } catch (err) {
      toast.error("No se ha podido registrar");
    } finally {
      setIsFichando(false);
      setIsProcessing(false);
    }
  };

  const handleQrSuccess = async (scannedCenterId: string | null) => {
    await insertMovement("Entrada", "QR", "Entrada registrada correctamente.", {
      centerId: scannedCenterId,
    });
  };

  const handleDesplazamientoSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const motivo = desplazamientoMotivo.trim();
    if (!motivo) {
      toast.error("Indica el motivo del desplazamiento.");
      return;
    }
    await insertMovement("Entrada", "App", "Entrada por desplazamiento registrada.", {
      modalidad: "Desplazamiento",
      notas: motivo,
      centerId,
    });
    setDesplazamientoMotivo("");
    setDesplazamientoOpen(false);
  };

  if (!profesorId) {
    return (
      <Card className="w-full p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Tu usuario no tiene un <span className="font-mono">ID_PROFESOR</span> vinculado.
          Contacta con administración para poder fichar.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <Card className="w-full p-4 sm:p-6">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="flex w-full flex-col items-center gap-4 text-center">
            {state === "out" && (
              <>
                {!isFichando ? (
                  <Button
                    type="button"
                    size="lg"
                    className="h-16 w-full gap-3 text-lg"
                    disabled={isPending}
                    onClick={() => setIsFichando(true)}
                  >
                    <QrCode className="h-6 w-6" />
                    Registrar Entrada
                  </Button>
                ) : (
                  <div className="w-full animate-in fade-in slide-in-from-bottom-2 space-y-4">
                    <div className="w-full space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">
                        Escanea el QR del centro para fichar
                      </p>
                      <ProfesorQrScanner
                        tenantId={tenantId}
                        onSuccess={(id) => void handleQrSuccess(id)}
                      />
                    </div>
                    <div className="flex w-full flex-col gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-14 w-full text-base"
                        disabled={isPending}
                        onClick={() => setDesplazamientoOpen(true)}
                      >
                        <MapPin className="mr-2 h-5 w-5" />
                        Fichar fuera del centro
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-14 w-full text-base"
                        onClick={() => setIsFichando(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {(state === "active" || state === "paused") && (
              <>
                <div className="w-full space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {state === "paused" ? "Tiempo en pausa" : "Tiempo transcurrido"}
                  </p>
                  <p className="font-mono text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">
                    {elapsedLabel}
                  </p>
                  {state === "paused" && (
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-amber-700"
                    >
                      En pausa
                    </Badge>
                  )}
                </div>

                {state === "active" && (
                  <div className="flex w-full flex-col gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-14 w-full text-base"
                      disabled={isPending}
                      onClick={() =>
                        void insertMovement("Inicio Pausa", "App", "Pausa iniciada.")
                      }
                    >
                      <Pause className="mr-2 h-5 w-5" />
                      Pausa
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-14 w-full text-base"
                      disabled={isPending}
                      onClick={() =>
                        void insertMovement("Salida", "App", "Jornada finalizada.")
                      }
                    >
                      <Square className="mr-2 h-5 w-5" />
                      Fin Jornada
                    </Button>
                  </div>
                )}

                {state === "paused" && (
                  <div className="flex w-full flex-col gap-4">
                    <Button
                      type="button"
                      className="h-14 w-full text-base"
                      disabled={isPending}
                      onClick={() =>
                        void insertMovement("Fin de Pausa", "App", "Jornada reanudada.")
                      }
                    >
                      <Play className="mr-2 h-5 w-5" />
                      Continuar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-14 w-full text-base"
                      disabled={isPending}
                      onClick={() =>
                        void insertMovement("Salida", "App", "Jornada finalizada.")
                      }
                    >
                      <Square className="mr-2 h-5 w-5" />
                      Fin Jornada
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Card>

      <Card className="w-full p-4">
        <h2 className="mb-3 text-sm font-semibold">Historial de jornadas</h2>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : shiftBlocks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aún no tienes jornadas registradas.
          </p>
        ) : (
          <div className="flex w-full flex-col gap-2">
            <div className="grid grid-cols-3 gap-2 border-b pb-2 text-xs font-semibold text-muted-foreground">
              <span>Inicio</span>
              <span>Fin</span>
              <span className="text-right">Total Horas</span>
            </div>
            {shiftBlocks.map((block) => (
              <div
                key={block.id}
                className={`grid grid-cols-3 gap-2 rounded-md border px-3 py-3 text-sm ${
                  block.anulado ? "line-through opacity-50" : ""
                }`}
              >
                <span className="font-medium">{formatFechaHora(block.inicio)}</span>
                <span>{block.fin ? formatFechaHora(block.fin) : "—"}</span>
                <span className="text-right font-mono">{formatHorasBlock(block.totalHoras)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={desplazamientoOpen} onOpenChange={setDesplazamientoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fichar fuera del centro</DialogTitle>
            <DialogDescription>
              Indica el motivo del desplazamiento. Este campo es obligatorio.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleDesplazamientoSubmit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="desplazamiento-motivo">Motivo</Label>
              <Textarea
                id="desplazamiento-motivo"
                value={desplazamientoMotivo}
                onChange={(e) => setDesplazamientoMotivo(e.target.value)}
                placeholder="Describe el motivo del desplazamiento..."
                rows={4}
                required
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDesplazamientoOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="h-14 w-full sm:w-auto"
                disabled={isPending || !desplazamientoMotivo.trim()}
              >
                Confirmar fichaje
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
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
    () =>
      profesorId
        ? fichajes.filter((f) => f.ID_PROFESOR === profesorId)
        : [],
    [fichajes, profesorId],
  );

  const todayRecords = useMemo(
    () => ownRecords.filter((f) => isRecordToday(f)),
    [ownRecords],
  );

  const { state, entradaAt } = useMemo(
    () => deriveClockState(todayRecords),
    [todayRecords],
  );

  useEffect(() => {
    if (state === "out" || !entradaAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state, entradaAt]);

  const elapsedLabel =
    entradaAt && state !== "out"
      ? formatElapsed(now - entradaAt.getTime())
      : "00:00:00";

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
    await insertMovement("Entrada", "QR", "Entrada registrada correctamente.", "Presencial", centerId);
  };

  if (!profesorId) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Tu usuario no tiene un <span className="font-mono">ID_PROFESOR</span> vinculado.
          Contacta con administración para poder fichar.
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
                {state === "paused" && (
                  <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                    En pausa
                  </Badge>
                )}
              </div>
            )}

            {state === "out" && (
              <Button
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
                  onClick={() =>
                    void insertMovement("Inicio Pausa", "App", "Pausa iniciada.")
                  }
                >
                  <Pause className="h-4 w-4" />
                  Pausa
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  className="gap-2"
                  disabled={isPending}
                  onClick={() =>
                    void insertMovement("Salida", "App", "Jornada finalizada.")
                  }
                >
                  <Square className="h-4 w-4" />
                  Fin Jornada
                </Button>
              </div>
            )}

            {state === "paused" && (
              <Button
                size="lg"
                className="h-14 px-8 text-base gap-2"
                disabled={isPending}
                onClick={() =>
                  void insertMovement("Fin de Pausa", "App", "Jornada reanudada.")
                }
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
        <div className="overflow-x-auto">
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
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
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
      </Card>

      <QrScannerOverlay
        open={qrOpen}
        tenantId={tenantId}
        onClose={() => setQrOpen(false)}
        onSuccess={(centerId) => void handleQrSuccess(centerId)}
      />

      <FichajeDetailDialog
        record={viewing}
        onClose={() => setViewing(null)}
        showProfesor={false}
      />

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
  tenantId,
}: {
  canManual: boolean;
  canGenerateQrPoster: boolean;
  tenantId: string;
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
  const { list, create } = useFichajes(filterCenterId);
  const [selectedDate, setSelectedDate] = useState(localTodayDateKey);
  const conciliacion = useFichajesConciliacionAdmin(selectedDate);

  const handleManualSubmit = async (
    input: FichajeCreateInput,
    successMessage: string,
  ) => {
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

  const profesores = list.data?.profesores ?? [];
  const fichajesHistorial = list.data?.fichajes ?? [];
  const conciliacionRows = conciliacion.data ?? [];
  const isLoading = conciliacion.isLoading;
  const isPending = create.isPending;
  const [query, setQuery] = useState("");
  const [filtroProfesor, setFiltroProfesor] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [qrPosterOpen, setQrPosterOpen] = useState(false);

  const profById = useMemo(
    () => new Map(profesores.map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR])),
    [profesores],
  );

  const allowedProfIds = useMemo(
    () => new Set(profesores.map((p) => p.ID_PROFESOR)),
    [profesores],
  );

  const filtered = useMemo(() => {
    let rows = conciliacionRows.filter((r) => allowedProfIds.has(r.ID_PROFESOR));
    if (filtroProfesor) {
      rows = rows.filter((r) => r.ID_PROFESOR === filtroProfesor);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter((r) => {
        const nombre = conciliacionProfesorNombre(r, profById);
        return (
          nombre.toLowerCase().includes(q) ||
          r.TIPO_MOVIMIENTO.toLowerCase().includes(q) ||
          r.ESTADO_TOLERANCIA.toLowerCase().includes(q) ||
          r.ESTADO_LEGAL.toLowerCase().includes(q)
        );
      });
    }
    return rows;
  }, [conciliacionRows, filtroProfesor, query, profById, allowedProfIds]);

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

    const byProfesor = new Map<string, FichajeConciliacionAdminRow[]>();
    for (const row of filtered) {
      const group = byProfesor.get(row.ID_PROFESOR) ?? [];
      group.push(row);
      byProfesor.set(row.ID_PROFESOR, group);
    }

    const blocks: ConciliacionJornadaRow[] = [];

    for (const [idProfesor, marks] of byProfesor) {
      const sorted = [...marks].sort((a, b) =>
        a.FECHA_HORA_REAL.localeCompare(b.FECHA_HORA_REAL),
      );

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
          entrada.ESTADO_TOLERANCIA === "Alerta" ||
          salida?.ESTADO_TOLERANCIA === "Alerta";

        blocks.push({
          id: salida
            ? `${entrada.ID_FICHAJE}-${salida.ID_FICHAJE}`
            : `${entrada.ID_FICHAJE}-open`,
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {jornadas.length} jornada{jornadas.length === 1 ? "" : "s"} el {selectedDate}
        </p>
        {(canGenerateQrPoster || canManual) && (
          <div className="flex flex-wrap gap-2">
            {canGenerateQrPoster && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setQrPosterOpen(true)}
              >
                <QrCode className="mr-2 h-4 w-4" />
                Generar Cartel QR
              </Button>
            )}
            {canManual && (
              <Button type="button" onClick={() => setManualOpen(true)}>
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
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 items-end">
          <div className="space-y-1.5">
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
            <CentroTableFilter
              id="fichajes-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={setSelectedCenterId}
            />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="fichajes-profesor-filter">Profesor</Label>
            <Select
              value={filtroProfesor || ALL_VALUE}
              onValueChange={(v) => setFiltroProfesor(v === ALL_VALUE ? "" : v)}
            >
              <SelectTrigger id="fichajes-profesor-filter">
                <SelectValue placeholder="Todos los profesores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Todos los profesores</SelectItem>
                {profesores.map((p) => (
                  <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR}>
                    {p.NOMBRE_PROFESOR}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fichajes-fecha-filter">Fecha</Label>
            <Input
              id="fichajes-fecha-filter"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="Fecha de conciliación"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 text-xs font-semibold">Profesor</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Entrada</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Salida</TableHead>
                <TableHead className="h-9 text-xs font-semibold text-right">Total Horas</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5} className="py-2">
                      <Skeleton className="h-7 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : jornadas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Sin jornadas de conciliación para esta fecha.
                  </TableCell>
                </TableRow>
              ) : (
                jornadas.map((jornada) => (
                  <TableRow
                    key={jornada.id}
                    className={anuladoRowClass(jornada.anulado)}
                  >
                    <TableCell className="py-2 text-sm font-semibold">
                      {jornada.nombreProfesor}
                      {jornada.anulado && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          Anulado
                        </Badge>
                      )}
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

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
}: {
  open: boolean;
  onClose: () => void;
  profesores: ProfesorLookup[];
  fichajes: FichajeData[];
  submitting: boolean;
  onSubmitNuevo: (values: FichajeCreateInput) => Promise<void>;
  onSubmitModificacion: (values: FichajeCreateInput) => Promise<void>;
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
    return fichajes.filter(
      (f) =>
        f.ID_PROFESOR === idProfesor &&
        !isFichajeAnulado(f.ESTADO_LEGAL) &&
        !isCorrectionMovement(f.TIPO_MOVIMIENTO),
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
    if (open) {
      resetForm();
    }
  }, [open, resetForm]);

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
              variant="outline"
              className="h-auto justify-start gap-3 px-4 py-4 text-left"
              onClick={() => handleSelectAction("nuevo")}
            >
              <Plus className="h-5 w-5 shrink-0 text-blue-950" />
              <span>
                <span className="block font-semibold">Nuevo Fichaje</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  Registra una marca limpia en la línea temporal.
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start gap-3 px-4 py-4 text-left"
              onClick={() => handleSelectAction("modificacion")}
            >
              <FilePenLine className="h-5 w-5 shrink-0 text-amber-700" />
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
                <Button type="button" variant="ghost" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting || !canSubmitNuevo}>
                  {submitting ? "Guardando..." : "Registrar"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!canSubmitModificacion) return;
              const motivo = motivoModificacion.trim();
              await onSubmitModificacion({
                ID_PROFESOR: idProfesor,
                TIPO_MOVIMIENTO: CORRECCION_APROBADA,
                ID_FICHAJE_CORREGIDO: idFichajeCorregido,
                FECHA_HORA_MANUAL: fechaHora
                  ? localDatetimeToServerTimestamp(fechaHora)
                  : undefined,
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
                  <Select
                    value={idFichajeCorregido}
                    onValueChange={handleFichajeCorregidoChange}
                  >
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
                <Button type="button" variant="ghost" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || !canSubmitModificacion}
                >
                  {submitting ? "Guardando..." : "Registrar modificación"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}

        {stage === "action_type" && (
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleClose}>
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

function FichajesProfesorPage() {
  const { perfil, tenantId } = useActiveTenant();
  const { session } = useApp();
  const { list, insert } = useProfesorFichajes();

  const fichajes = list.data ?? [];

  const auditRejectedFichaje = (
    input: ProfesorFichajeCreateInput,
    err: unknown,
  ) => {
    void logFichajeRejection({
      tenantId,
      idProfesor: input.ID_PROFESOR,
      idUsuario: session?.user?.id ?? null,
      tipoMovimiento: input.TIPO_MOVIMIENTO,
      errorMessage: err instanceof Error ? err.message : String(err),
      attemptedPayload: input as Record<string, unknown>,
    });
  };

  const handleClockAction = async (input: ProfesorFichajeCreateInput) => {
    try {
      await insert.mutateAsync(input);
    } catch (err) {
      auditRejectedFichaje(input, err);
      throw err;
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fichajes</h1>
        <p className="text-sm text-muted-foreground">Registro de presencia</p>
      </div>

      {list.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar fichajes: {(list.error as Error)?.message}
        </div>
      )}

      <ProfesorFichajesView
        fichajes={fichajes}
        profesorId={perfil.ID_PROFESOR}
        centerId={perfil.ID_CENTRO}
        tenantId={tenantId}
        isLoading={list.isLoading}
        isPending={insert.isPending}
        onClockAction={handleClockAction}
      />
    </div>
  );
}

function FichajesAdminPage() {
  const { rol, perfil, tenantId } = useActiveTenant();
  const { session } = useApp();
  const { list, create, createSealed, requestCorrection } = useFichajes();

  const fichajes = list.data?.fichajes ?? [];
  const profesores = list.data?.profesores ?? [];

  const showControlTab =
    isMasterRole(rol) || isAdminRole(rol) || isDireccionRole(rol);
  const canManualFichaje = isMasterRole(rol) || isAdminRole(rol);
  const canGenerateQrPoster = isAdminRole(rol);

  const auditRejectedFichaje = (
    input: FichajeSealedCreateInput,
    err: unknown,
  ) => {
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fichajes</h1>
        <p className="text-sm text-muted-foreground">
          Control de presencia y registro horario
        </p>
      </div>

      {list.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar fichajes: {(list.error as Error)?.message}
        </div>
      )}

      <Tabs defaultValue="fichar" className="w-full">
        <TabsList
          className={
            showControlTab
              ? "mb-4 grid w-full max-w-md grid-cols-2"
              : "mb-4 w-full max-w-xs"
          }
        >
          <TabsTrigger value="fichar">Fichar</TabsTrigger>
          {showControlTab && (
            <TabsTrigger value="control">Control Horario</TabsTrigger>
          )}
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
              tenantId={tenantId}
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
    return <FichajesProfesorPage />;
  }
  return <FichajesAdminPage />;
}
