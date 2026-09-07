import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MutableRefObject,
} from "react";
import jsQR from "jsqr";
import { MapPin, Pause, Play, QrCode, Square, FilePenLine } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { collectFichajeComplianceMetadata } from "@/lib/fichajeCompliance";
import { logFichajeRejection } from "@/lib/fichajeAudit";
import { CorrectionRequestDialog } from "@/components/fichajes/CorrectionRequestDialog";
import { useAvisosInternos } from "@/hooks/useAvisosInternos";
import type { FichajeData } from "@/hooks/useFichajes";
import {
  CLOCK_MOVEMENT_TYPES,
  canRequestCorrection,
  formatFichajeErrorMessage,
  isCorrectionMovement,
} from "@/lib/fichajeEidas";
import {
  useProfesorFichajes,
  type ProfesorFichajeCreateInput,
  type ProfesorFichajeRow,
} from "@/hooks/useFichajes";
import { useActiveTenant, useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { syncWorkspaceMetadata } from "@/lib/workspace";

type ClockState = "out" | "active" | "paused";

const ESTADO_LEGAL_ANULADO = "Anulado por Corrección";

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

function localTodayDateKey(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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

function isFichajeAnulado(estadoLegal: string | null | undefined): boolean {
  return estadoLegal === ESTADO_LEGAL_ANULADO;
}

function normalizeMovimiento(mov: string | null | undefined): string {
  return (mov ?? "").trim();
}

function isRecordTodayProfesor(f: ProfesorFichajeRow): boolean {
  return localDateKeyFromServerTimestamp(f.FECHA_HORA_REAL) === localTodayDateKey();
}

function deriveProfesorClockState(todayRecords: ProfesorFichajeRow[]): {
  state: ClockState;
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
    a.FECHA_HORA_REAL.localeCompare(b.FECHA_HORA_REAL),
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
  const entradaAt = entradaRecord ? parseServerDate(entradaRecord.FECHA_HORA_REAL) : null;

  if (last === "Salida") return { state: "out", entradaAt: null };
  if (last === "Inicio Pausa") return { state: "paused", entradaAt };
  if (last === "Entrada" || last === "Fin de Pausa") {
    return { state: "active", entradaAt };
  }

  return { state: "out", entradaAt: null };
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
    if (mov === "Entrada") {
      openStart = record;
    } else if (mov === "Salida" && openStart) {
      const finAt = parseServerDate(record.FECHA_HORA_REAL);
      const inicioAt = parseServerDate(openStart.FECHA_HORA_REAL);
      const ms = finAt && inicioAt ? finAt.getTime() - inicioAt.getTime() : 0;
      blocks.push({
        id: `${openStart.ID_FICHAJE}-${record.ID_FICHAJE}`,
        inicio: openStart.FECHA_HORA_REAL,
        fin: record.FECHA_HORA_REAL,
        totalHoras: ms / 3_600_000,
        anulado: isFichajeAnulado(openStart.ESTADO_LEGAL) || isFichajeAnulado(record.ESTADO_LEGAL),
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

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /FBAN|FBAV|Instagram|Line\/|WhatsApp|TikTok|musical_ly|Twitter|LinkedInApp|Snapchat|Pinterest|GSA\//i.test(
      ua,
    ) || /; wv\)/.test(ua)
  );
}

function formatCameraError(err: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "La cámara solo funciona en HTTPS. Abre la app en Safari o Chrome.";
  }
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Permiso de cámara denegado. Actívalo en Ajustes del teléfono y pulsa Reintentar.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No se encontró una cámara usable en este dispositivo.";
  }
  if (name === "NotReadableError") {
    return "La cámara está ocupada por otra aplicación. Ciérrala y pulsa Reintentar.";
  }
  return "No se pudo acceder a la cámara. Prueba Safari o Chrome, o ficha fuera del centro.";
}

const CAMERA_CONSTRAINTS: MediaStreamConstraints[] = [
  { audio: false, video: { facingMode: { ideal: "environment" } } },
  { audio: false, video: { facingMode: "environment" } },
  { audio: false, video: true },
];

async function requestCameraStream(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("Camera API unavailable", "NotSupportedError");
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new DOMException("Camera requires HTTPS", "SecurityError");
  }

  let lastError: unknown;
  for (const constraints of CAMERA_CONSTRAINTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No se pudo acceder a la cámara.");
}

function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

function createQrBarcodeDetector(): BarcodeDetectorLike | null {
  const Ctor = (
    window as unknown as {
      BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
    }
  ).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

function waitForVideoMetadata(video: HTMLVideoElement, timeoutMs = 5_000): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("No se pudo iniciar la vista de la cámara."));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) resolve();
      else reject(new Error("No se pudo iniciar la vista de la cámara."));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("error", onError);
  });
}

function startVideoQrScan(
  video: HTMLVideoElement,
  scanningRef: MutableRefObject<boolean>,
  getCancelled: () => boolean,
  onDetected: (rawValue: string) => void,
): () => void {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const detector = createQrBarcodeDetector();
  let detecting = false;
  let raf = 0;
  scanningRef.current = true;

  const finish = (rawValue: string) => {
    if (!scanningRef.current || getCancelled()) return;
    scanningRef.current = false;
    cancelAnimationFrame(raf);
    onDetected(rawValue);
  };

  const scan = () => {
    if (!scanningRef.current || getCancelled()) return;

    if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
      if (detector && !detecting) {
        detecting = true;
        void detector
          .detect(video)
          .then((codes) => {
            const raw = codes[0]?.rawValue?.trim();
            if (raw) finish(raw);
          })
          .catch(() => {
            /* jsQR sigue como respaldo */
          })
          .finally(() => {
            detecting = false;
          });
      }

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code?.data) {
          finish(code.data);
          return;
        }
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

function ProfesorQrScanner({
  tenantId,
  stream,
  onSuccess,
}: {
  tenantId: string;
  stream: MediaStream;
  onSuccess: (centerId: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const scanningRef = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const validateAndSuccess = useCallback(
    (value: string) => {
      const parsed = parseFichajeQrPayload(value);
      if (parsed && parsed.tenantId === tenantId) {
        onSuccessRef.current(parsed.centerId);
        return true;
      }
      if (matchesTenantQrPayload(value, tenantId)) {
        onSuccessRef.current(null);
        return true;
      }
      setError("El código no corresponde a esta escuela.");
      return false;
    },
    [tenantId],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let stopScan: (() => void) | null = null;

    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;

    const mediaEl = video;
    async function attach() {
      try {
        await waitForVideoMetadata(mediaEl);
        await mediaEl.play();
        if (cancelled) return;
        stopScan = startVideoQrScan(
          mediaEl,
          scanningRef,
          () => cancelled,
          (rawValue) => {
            validateAndSuccess(rawValue);
          },
        );
      } catch {
        if (!cancelled) setError("No se pudo iniciar la vista de la cámara.");
      }
    }

    void attach();

    return () => {
      cancelled = true;
      scanningRef.current = false;
      stopScan?.();
      video.srcObject = null;
    };
  }, [stream, validateAndSuccess]);

  return (
    <div className="w-full space-y-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />
      </div>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}

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
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const inAppBrowser = useMemo(() => isInAppBrowser(), []);

  cameraStreamRef.current = cameraStream;

  const stopCamera = useCallback(() => {
    stopMediaStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraStarting(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraStarting(true);
    try {
      const stream = await requestCameraStream();
      stopMediaStream(cameraStreamRef.current);
      cameraStreamRef.current = stream;
      setCameraStream(stream);
    } catch (err) {
      stopMediaStream(cameraStreamRef.current);
      cameraStreamRef.current = null;
      setCameraStream(null);
      setCameraError(formatCameraError(err));
    } finally {
      setCameraStarting(false);
    }
  }, []);

  useEffect(() => {
    return () => stopMediaStream(cameraStreamRef.current);
  }, []);

  const todayRecords = useMemo(() => fichajes.filter((f) => isRecordTodayProfesor(f)), [fichajes]);

  const { state, entradaAt } = useMemo(
    () => deriveProfesorClockState(todayRecords),
    [todayRecords],
  );

  const shiftBlocks = useMemo(() => buildShiftBlocks(fichajes), [fichajes]);

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
      toast.error(formatFichajeErrorMessage(err));
    } finally {
      stopCamera();
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
          Tu usuario no tiene un <span className="font-mono">ID_PROFESOR</span> vinculado. Contacta
          con administración para poder fichar.
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
                    onClick={() => {
                      setIsFichando(true);
                      void startCamera();
                    }}
                  >
                    <QrCode className="h-6 w-6" />
                    Registrar Entrada
                  </Button>
                ) : (
                  <div className="w-full animate-in fade-in slide-in-from-bottom-2 space-y-4">
                    {inAppBrowser && (
                      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                        Estás en un navegador embebido (WhatsApp, Instagram, etc.). La cámara suele
                        fallar. Abre esta página en Safari o Chrome.
                      </p>
                    )}
                    <div className="w-full space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">
                        Escanea el QR del centro para fichar
                      </p>
                      {cameraStream ? (
                        <ProfesorQrScanner
                          tenantId={tenantId}
                          stream={cameraStream}
                          onSuccess={(id) => void handleQrSuccess(id)}
                        />
                      ) : (
                        <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-black">
                          {cameraStarting ? (
                            <Skeleton className="h-full w-full rounded-none" />
                          ) : null}
                        </div>
                      )}
                      {cameraError && (
                        <>
                          <p className="text-center text-sm text-destructive">{cameraError}</p>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-12 w-full text-base"
                            disabled={cameraStarting}
                            onClick={() => void startCamera()}
                          >
                            Reintentar cámara
                          </Button>
                        </>
                      )}
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
                        onClick={() => {
                          stopCamera();
                          setCameraError(null);
                          setIsFichando(false);
                        }}
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
                    Tiempo transcurrido
                  </p>
                  <p className="font-mono text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">
                    {elapsedLabel}
                  </p>
                  {state === "paused" && <StatusBadge status="pending">En pausa</StatusBadge>}
                </div>

                {state === "active" && (
                  <div className="flex w-full flex-col gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-14 w-full text-base"
                      disabled={isPending}
                      onClick={() => void insertMovement("Inicio Pausa", "App", "Pausa iniciada.")}
                    >
                      <Pause className="mr-2 h-5 w-5" />
                      Pausa
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-14 w-full text-base"
                      disabled={isPending}
                      onClick={() => void insertMovement("Salida", "App", "Jornada finalizada.")}
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
                      onClick={() => void insertMovement("Salida", "App", "Jornada finalizada.")}
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
              <Button type="button" variant="ghost" onClick={() => setDesplazamientoOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="brand"
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

export function TeacherFichajesDashboard({ highlightFichajeId }: { highlightFichajeId?: string }) {
  const { perfil, tenantId } = useActiveTenant();
  const { session } = useApp();
  const { list, insert, requestCorrection, respondManualAcceptance, respondAdminModification } =
    useProfesorFichajes();
  const { list: avisosList } = useAvisosInternos();

  const fichajes = useMemo(() => list.data ?? [], [list.data]);

  const pendingSolicitudes = useMemo(() => {
    return (avisosList.data ?? []).filter((aviso) => {
      if (aviso.LEIDO !== false) return false;
      const tipo = aviso.TIPO?.trim() ?? "";
      return (
        tipo === "Fichaje pendiente de aceptación" || tipo === "Modificación de fichaje pendiente"
      );
    });
  }, [avisosList.data]);

  const correctionRespuestas = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return (avisosList.data ?? []).filter((aviso) => {
      const tipo = aviso.TIPO?.trim() ?? "";
      if (
        tipo !== "Corrección de fichaje autorizada" &&
        tipo !== "Corrección de fichaje rechazada"
      ) {
        return false;
      }
      if (!aviso.FECHA) return true;
      const fecha = new Date(aviso.FECHA);
      return !Number.isNaN(fecha.getTime()) && fecha.getTime() >= cutoff;
    });
  }, [avisosList.data]);

  const corregibles = useMemo(() => {
    const solicitudRows = fichajes.map((row) => ({
      ID_FICHAJE: row.ID_FICHAJE,
      ID_FICHAJE_CORREGIDO: row.ID_FICHAJE_CORREGIDO ?? null,
      TIPO_MOVIMIENTO: row.TIPO_MOVIMIENTO,
      ESTADO: row.ESTADO ?? null,
    }));
    return fichajes.filter((f) => {
      if (isFichajeAnulado(f.ESTADO_LEGAL)) return false;
      const mov = normalizeMovimiento(f.TIPO_MOVIMIENTO);
      if (isCorrectionMovement(mov)) return false;
      if (!CLOCK_MOVEMENT_TYPES.has(mov)) return false;
      return canRequestCorrection(
        { ID_FICHAJE: f.ID_FICHAJE, TIPO_MOVIMIENTO: f.TIPO_MOVIMIENTO },
        solicitudRows,
      );
    });
  }, [fichajes]);

  const [correctionRecord, setCorrectionRecord] = useState<FichajeData | null>(null);
  const [correctionPickerId, setCorrectionPickerId] = useState("");
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [rejectDialog, setRejectDialog] = useState<{
    idFichaje: string;
    tipo: "manual" | "modificacion";
    mensaje: string;
  } | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState("");

  const auditRejectedFichaje = (input: ProfesorFichajeCreateInput, err: unknown) => {
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
      await syncWorkspaceMetadata(perfil);
      await insert.mutateAsync(input);
    } catch (err) {
      auditRejectedFichaje(input, err);
      throw err;
    }
  };

  const handleAcceptSolicitud = async (idFichaje: string, tipo: "manual" | "modificacion") => {
    try {
      if (tipo === "manual") {
        await respondManualAcceptance.mutateAsync({ idFichaje, acepta: true });
      } else {
        await respondAdminModification.mutateAsync({ idFichaje, acepta: true });
      }
      toast.success("Solicitud aceptada.");
    } catch (err) {
      toast.error(formatFichajeErrorMessage(err));
    }
  };

  const handleRejectSolicitud = async () => {
    if (!rejectDialog) return;
    const motivo = rejectMotivo.trim();
    if (!motivo) {
      toast.error("Indica el motivo del rechazo.");
      return;
    }
    try {
      if (rejectDialog.tipo === "manual") {
        await respondManualAcceptance.mutateAsync({
          idFichaje: rejectDialog.idFichaje,
          acepta: false,
          motivo,
        });
      } else {
        await respondAdminModification.mutateAsync({
          idFichaje: rejectDialog.idFichaje,
          acepta: false,
          motivo,
        });
      }
      toast.success("Solicitud rechazada.");
      setRejectDialog(null);
      setRejectMotivo("");
    } catch (err) {
      toast.error(formatFichajeErrorMessage(err));
    }
  };

  const handleRequestCorrection = async (values: { fechaHoraManual: string; motivo: string }) => {
    if (!perfil.ID_PROFESOR || !correctionRecord) return;
    const compliance = await collectFichajeComplianceMetadata();
    try {
      await requestCorrection.mutateAsync({
        idFichajeCorregido: correctionRecord.ID_FICHAJE,
        fechaHoraManual: values.fechaHoraManual,
        motivo: values.motivo,
        compliance,
      });
      toast.success("Solicitud de corrección enviada.");
      setCorrectionOpen(false);
      setCorrectionRecord(null);
      setCorrectionPickerId("");
    } catch (err) {
      toast.error(formatFichajeErrorMessage(err));
    }
  };

  const solicitudBusy =
    respondManualAcceptance.isPending ||
    respondAdminModification.isPending ||
    requestCorrection.isPending;

  return (
    <div className="space-y-4">
      {list.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar fichajes: {(list.error as Error)?.message}
        </div>
      )}

      {pendingSolicitudes.length > 0 && (
        <Card className="w-full space-y-3 p-4">
          <h2 className="text-sm font-semibold">Solicitudes pendientes</h2>
          {pendingSolicitudes.map((aviso) => {
            const idFichaje = aviso.ID_FICHAJE?.trim() ?? "";
            const tipo =
              aviso.TIPO?.trim() === "Modificación de fichaje pendiente"
                ? "modificacion"
                : "manual";
            const highlighted = highlightFichajeId && idFichaje === highlightFichajeId;
            return (
              <div
                key={aviso.ID_AVISO}
                className={`rounded-md border p-3 space-y-2${
                  highlighted ? " border-primary ring-2 ring-primary/30" : ""
                }`}
              >
                <p className="text-sm">{aviso.MENSAJE}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="brand"
                    disabled={solicitudBusy || !idFichaje}
                    onClick={() => void handleAcceptSolicitud(idFichaje, tipo)}
                  >
                    Aceptar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={solicitudBusy || !idFichaje}
                    onClick={() => {
                      setRejectMotivo("");
                      setRejectDialog({
                        idFichaje,
                        tipo,
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

      {correctionRespuestas.length > 0 && (
        <Card className="w-full space-y-3 p-4">
          <h2 className="text-sm font-semibold">Respuestas a correcciones</h2>
          {correctionRespuestas.map((aviso) => {
            const idFichaje = aviso.ID_FICHAJE?.trim() ?? "";
            const highlighted = highlightFichajeId && idFichaje === highlightFichajeId;
            return (
              <div
                key={aviso.ID_AVISO}
                className={`rounded-md border p-3 space-y-1${
                  highlighted ? " border-primary ring-2 ring-primary/30" : ""
                }`}
              >
                <p className="text-xs font-medium text-muted-foreground">{aviso.TIPO}</p>
                <p className="text-sm">{aviso.MENSAJE}</p>
              </div>
            );
          })}
        </Card>
      )}

      <Card className="w-full space-y-3 p-4">
        <h2 className="text-sm font-semibold">Solicitar corrección</h2>
        {corregibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay fichajes disponibles para corregir.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <Select
              value={correctionPickerId}
              onValueChange={(value) => {
                setCorrectionPickerId(value);
                const row = corregibles.find((f) => f.ID_FICHAJE === value);
                if (!row) {
                  setCorrectionRecord(null);
                  return;
                }
                setCorrectionRecord({
                  ID_FICHAJE: row.ID_FICHAJE,
                  ID_CLIENTE: row.ID_CLIENTE,
                  ID_PROFESOR: row.ID_PROFESOR,
                  TIPO_MOVIMIENTO: row.TIPO_MOVIMIENTO,
                  MODALIDAD: row.MODALIDAD,
                  FECHA_HORA: row.FECHA_HORA_REAL,
                  FECHA_HORA_REAL: row.FECHA_HORA_REAL,
                  ESTADO_LEGAL: row.ESTADO_LEGAL,
                  IP_FICHAJE: null,
                  USER_AGENT: null,
                  LATITUD_LONGITUD: null,
                  UBICACION: null,
                  METODO: null,
                  NOTAS: row.NOTAS,
                  TOTAL_HORAS_INTERVALO: row.TOTAL_HORAS_INTERVALO,
                  TOTAL_HORAS_ACUMULADAS_DIA: row.TOTAL_HORAS_ACUMULADAS_DIA,
                  ID_FICHAJE_CORREGIDO: null,
                  MODIFICADO_POR: null,
                  FECHA_HORA_MODIFICACION: null,
                  MOTIVO_MODIFICACION: null,
                  FECHA_HORA_MANUAL: null,
                  PROFESOR: null,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar fichaje" />
              </SelectTrigger>
              <SelectContent>
                {corregibles.map((f) => (
                  <SelectItem key={f.ID_FICHAJE} value={f.ID_FICHAJE}>
                    {formatFechaHora(f.FECHA_HORA_REAL)} · {f.TIPO_MOVIMIENTO}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={!correctionRecord || solicitudBusy}
              onClick={() => setCorrectionOpen(true)}
            >
              <FilePenLine className="h-4 w-4" />
              Solicitar corrección
            </Button>
          </div>
        )}
      </Card>

      <ProfesorFichajesView
        fichajes={fichajes}
        profesorId={perfil.ID_PROFESOR}
        centerId={perfil.ID_CENTRO}
        tenantId={tenantId}
        isLoading={list.isLoading}
        isPending={insert.isPending}
        onClockAction={handleClockAction}
      />

      <CorrectionRequestDialog
        open={correctionOpen}
        record={correctionRecord}
        submitting={requestCorrection.isPending}
        onClose={() => setCorrectionOpen(false)}
        onSubmit={handleRequestCorrection}
      />

      <Dialog open={!!rejectDialog} onOpenChange={(open) => !open && setRejectDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar solicitud</DialogTitle>
            <DialogDescription>{rejectDialog?.mensaje}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-rechazo-fichaje">Motivo del rechazo *</Label>
            <Textarea
              id="motivo-rechazo-fichaje"
              value={rejectMotivo}
              onChange={(e) => setRejectMotivo(e.target.value)}
              rows={4}
              placeholder="Explica por qué rechazas esta solicitud..."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRejectDialog(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={solicitudBusy || !rejectMotivo.trim()}
              onClick={() => void handleRejectSolicitud()}
            >
              {solicitudBusy ? "Guardando..." : "Confirmar rechazo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
