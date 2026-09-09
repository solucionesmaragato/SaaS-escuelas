import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteAlumnoFoto,
  isAlumnoFotoStorageUrl,
  uploadAlumnoFoto,
} from "@/lib/alumnoFotoStorage";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

const CAMERA_CONSTRAINTS: MediaStreamConstraints[] = [
  { audio: false, video: { facingMode: { ideal: "environment" } } },
  { audio: false, video: { facingMode: "environment" } },
  { audio: false, video: true },
];

function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /FBAN|FBAV|Instagram|Line\/|WhatsApp|TikTok|musical_ly|Twitter|LinkedInApp|Snapchat|Pinterest|GSA\//i.test(
      ua,
    ) || /; wv\)/.test(ua)
  );
}

/** Solo móvil real. No usar MacIntel+maxTouchPoints: Safari en MacBook lo cumple y rompe getUserMedia. */
function prefersNativeCamera(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPod|Android/i.test(ua) || /iPad/i.test(ua) || isInAppBrowser();
}

function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

function formatCameraError(err: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "La cámara solo funciona en HTTPS. Abre la app en Safari o Chrome.";
  }
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Permiso de cámara denegado. Actívalo en el navegador (icono de cámara en la barra de direcciones) y pulsa Reintentar.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No se encontró una cámara usable en este dispositivo.";
  }
  if (name === "NotReadableError") {
    return "La cámara está ocupada por otra aplicación. Ciérrala y pulsa Reintentar.";
  }
  return "No se pudo acceder a la cámara. Prueba Safari o Chrome.";
}

function formatUploadError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/permission denied|row-level security|policy/i.test(message)) {
    return "No se pudo guardar la foto en el servidor. Comprueba que la migración del bucket alumnos-fotos está aplicada y que tu usuario tiene permiso.";
  }
  return message || "No se pudo subir la foto.";
}

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
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
        resolve();
      } else {
        reject(new Error("No se pudo iniciar la vista de la cámara."));
      }
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

function captureVideoFrame(video: HTMLVideoElement): Promise<File> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    return Promise.reject(new Error("La cámara aún no está lista."));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return Promise.reject(new Error("No se pudo capturar la imagen."));
  }

  context.drawImage(video, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No se pudo capturar la imagen."));
          return;
        }
        resolve(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  });
}

function AlumnoCameraPreview({
  stream,
  videoRef,
  onReady,
  onError,
}: {
  stream: MediaStream;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onReady: () => void;
  onError: (message: string) => void;
}) {
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;

    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;

    void (async () => {
      try {
        await waitForVideoMetadata(video);
        await video.play();
        if (!cancelled) onReadyRef.current();
      } catch {
        if (!cancelled) onErrorRef.current("No se pudo mostrar la vista previa de la cámara.");
      }
    })();

    return () => {
      cancelled = true;
      video.srcObject = null;
    };
  }, [stream, videoRef]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="aspect-[4/3] h-full w-full object-cover"
    />
  );
}

type AlumnoFotoFieldProps = {
  name: string;
  tenantId: string;
  alumnoId: string;
  photoUrl?: string | null;
  onPhotoUrlChange?: (value: string | null) => void;
  onPhotoSaved?: (value: string | null) => void | Promise<void>;
  readOnly?: boolean;
  disabled?: boolean;
  className?: string;
};

export function AlumnoFotoField({
  name,
  tenantId,
  alumnoId,
  photoUrl,
  onPhotoUrlChange,
  onPhotoSaved,
  readOnly = false,
  disabled = false,
  className,
}: AlumnoFotoFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const useNativeCamera = useMemo(() => prefersNativeCamera(), []);
  const inAppBrowser = useMemo(() => isInAppBrowser(), []);

  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  cameraStreamRef.current = cameraStream;

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const stopCamera = useCallback(() => {
    stopMediaStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    setCameraStream(null);
    setVideoReady(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStarting(false);
    setCameraError(null);
  }, []);

  const closeCamera = useCallback(() => {
    stopCamera();
    setCameraOpen(false);
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraStarting(true);
    setVideoReady(false);
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

  const handleHacerFoto = () => {
    if (useNativeCamera) {
      nativeCameraInputRef.current?.click();
      return;
    }
    setCameraOpen(true);
    void startCamera();
  };

  useEffect(() => {
    return () => stopMediaStream(cameraStreamRef.current);
  }, []);

  const trimmedUrl = photoUrl?.trim() ?? "";
  const displayUrl = previewUrl ?? trimmedUrl;
  const canEdit = !readOnly && !!onPhotoUrlChange;
  const controlsDisabled = disabled || uploading || !tenantId.trim() || !alumnoId.trim();
  const canCapture = !!cameraStream && videoReady && !cameraStarting && !cameraError;

  const resetFileInputs = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = "";
  };

  const handleSelectFile = async (file: File | null) => {
    if (!file || !canEdit) return;

    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);

    try {
      const publicUrl = await uploadAlumnoFoto(tenantId, alumnoId, file);
      onPhotoUrlChange(publicUrl);
      await onPhotoSaved?.(publicUrl);
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
      toast.success("Foto actualizada.");
    } catch (err) {
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
      toast.error(formatUploadError(err));
    } finally {
      setUploading(false);
      resetFileInputs();
    }
  };

  const handleCapturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !canCapture) return;

    try {
      const file = await captureVideoFrame(video);
      closeCamera();
      await handleSelectFile(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo capturar la foto.");
    }
  };

  const handleRemove = async () => {
    if (!canEdit || controlsDisabled) return;

    setUploading(true);
    try {
      if (isAlumnoFotoStorageUrl(trimmedUrl)) {
        await deleteAlumnoFoto(trimmedUrl);
      }
      onPhotoUrlChange(null);
      await onPhotoSaved?.(null);
      toast.success("Foto eliminada.");
    } catch (err) {
      toast.error(formatUploadError(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-4 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center",
          className,
        )}
      >
        <div className="relative shrink-0">
          <PersonAvatar
            name={name}
            photoUrl={displayUrl}
            className="h-20 w-20"
            fallbackClassName="text-lg"
          />
          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : null}
        </div>

        {canEdit ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label>Foto del alumno</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={UPLOAD_ACCEPT}
                className="hidden"
                disabled={controlsDisabled}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void handleSelectFile(file);
                }}
              />
              <input
                ref={nativeCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={controlsDisabled}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void handleSelectFile(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={controlsDisabled}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                {trimmedUrl || previewUrl ? "Cambiar foto" : "Subir foto"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={controlsDisabled}
                onClick={handleHacerFoto}
              >
                <Camera className="h-4 w-4" />
                Hacer foto
              </Button>
              {trimmedUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={controlsDisabled}
                  onClick={() => void handleRemove()}
                >
                  Quitar foto
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Sube desde galería o haz una foto con la cámara. Se redimensiona y comprime
              automáticamente.
            </p>
          </div>
        ) : null}
      </div>

      <Dialog
        open={cameraOpen}
        onOpenChange={(open) => {
          if (!open) closeCamera();
        }}
      >
        <DialogContent className="max-w-md gap-4">
          <DialogHeader>
            <DialogTitle>Hacer foto</DialogTitle>
            <DialogDescription>
              Encuadra al alumno y pulsa capturar. El navegador te pedirá permiso para usar la
              cámara.
            </DialogDescription>
          </DialogHeader>

          {inAppBrowser ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
              Estás en un navegador embebido. Abre esta página en Safari o Chrome para usar la
              cámara.
            </p>
          ) : null}

          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-black">
            {cameraStream ? (
              <AlumnoCameraPreview
                stream={cameraStream}
                videoRef={videoRef}
                onReady={() => setVideoReady(true)}
                onError={(message) => {
                  setVideoReady(false);
                  setCameraError(message);
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                {cameraStarting ? (
                  <Skeleton className="h-full w-full rounded-none" />
                ) : null}
              </div>
            )}
            {cameraStarting && cameraStream ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            ) : null}
            {cameraError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
                <p className="text-center text-sm text-white">{cameraError}</p>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={closeCamera}>
              Cancelar
            </Button>
            {cameraError ? (
              <Button type="button" disabled={cameraStarting} onClick={() => void startCamera()}>
                Reintentar
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!canCapture}
                onClick={() => void handleCapturePhoto()}
              >
                Capturar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
