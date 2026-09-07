import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, MessageCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  canSendMatriculaOnlineForAlumno,
  crearSolicitudMatriculaDesdeAlumno,
  fetchAlumnoSolicitudMatriculaStatus,
  sendMatriculaOnlineForAlumno,
} from "@/lib/matriculaWhatsApp";
import { buildMatriculaSignLink } from "@/lib/solicitudMatricula";
import { cn } from "@/lib/utils";

type EnviarMatriculaOnlineButtonProps = {
  idAlumno: string;
  telefono?: string | null;
  nombreAlumno?: string | null;
  nombreMadre?: string | null;
  nombrePadre?: string | null;
  estadoAlumno?: string | null;
  canWrite: boolean;
  className?: string;
};

export function EnviarMatriculaOnlineButton({
  idAlumno,
  telefono,
  nombreAlumno,
  nombreMadre,
  nombrePadre,
  estadoAlumno,
  canWrite,
  className,
}: EnviarMatriculaOnlineButtonProps) {
  const queryClient = useQueryClient();
  const [isSending, setIsSending] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const alumnoId = idAlumno?.trim();
  const phone = telefono?.trim() ?? "";

  const enabled =
    canWrite &&
    Boolean(alumnoId) &&
    canSendMatriculaOnlineForAlumno(estadoAlumno, telefono);

  const { data: status, isLoading } = useQuery({
    queryKey: ["matricula-online-alumno-status", alumnoId],
    enabled,
    queryFn: () => fetchAlumnoSolicitudMatriculaStatus(alumnoId!),
  });

  const resolveSignUrl = useCallback(async (): Promise<string | null> => {
    if (status?.tokenPublico?.trim()) {
      return buildMatriculaSignLink(status.tokenPublico);
    }

    const result = await crearSolicitudMatriculaDesdeAlumno(alumnoId!);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo generar el enlace de matrícula.");
      return null;
    }

    const token = result.token_publico?.trim();
    if (!token) {
      toast.error("No se recibió el token de matrícula.");
      return null;
    }

    return buildMatriculaSignLink(token);
  }, [alumnoId, status?.tokenPublico]);

  if (!enabled) return null;
  if (isLoading) {
    return <Skeleton className={cn("h-8 w-36", className)} />;
  }
  if (status?.hasFirmada) return null;

  const handleSend = async () => {
    if (!phone) return;
    setIsSending(true);
    try {
      const sent = await sendMatriculaOnlineForAlumno({
        ID_ALUMNO: alumnoId!,
        TLF_COMUNICACION: phone,
        NOMBRE_ALUMNO: nombreAlumno,
        NOMBRE_MADRE: nombreMadre,
        NOMBRE_PADRE: nombrePadre,
      });
      await queryClient.invalidateQueries({ queryKey: ["matricula-online-alumno-status", alumnoId] });
      toast.success(
        sent.reused ? "Enlace de matrícula reenviado" : "Enlace de matrícula generado",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar la matrícula.");
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyLink = async () => {
    setIsCopying(true);
    try {
      const url = await resolveSignUrl();
      if (!url) return;
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado al portapapeles.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo copiar el enlace.");
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {phone ? (
        <Button
          type="button"
          variant="brand-outline"
          size="sm"
          className="gap-2"
          disabled={isSending || isCopying}
          onClick={() => {
            void handleSend();
          }}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          {isSending
            ? "Generando enlace…"
            : status?.hasPending
              ? "Reenviar matrícula"
              : "Enviar matrícula"}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={isSending || isCopying}
        onClick={() => {
          void handleCopyLink();
        }}
      >
        <Copy className="h-4 w-4" aria-hidden />
        {isCopying ? "Copiando…" : "Copiar enlace"}
      </Button>
    </div>
  );
}
