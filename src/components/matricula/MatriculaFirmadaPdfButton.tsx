import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  downloadMatriculaPdfForAlumno,
  hasFirmadaMatriculaSolicitud,
} from "@/lib/matriculaPdfStaff";
import { cn } from "@/lib/utils";

type MatriculaFirmadaPdfButtonProps = {
  idAlumno: string;
  label?: string;
  variant?: "default" | "outline" | "brand" | "brand-outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

export function MatriculaFirmadaPdfButton({
  idAlumno,
  label = "Descargar matrícula firmada",
  variant = "outline",
  size = "sm",
  className,
  onClick,
}: MatriculaFirmadaPdfButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const alumnoId = idAlumno?.trim();

  const { data: isAvailable = false, isLoading } = useQuery({
    queryKey: ["matricula-firmada-disponible", alumnoId],
    enabled: Boolean(alumnoId),
    queryFn: () => hasFirmadaMatriculaSolicitud(alumnoId!),
  });

  if (!alumnoId || isLoading || !isAvailable) return null;

  const handleDownload = async (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;

    setIsDownloading(true);
    try {
      await downloadMatriculaPdfForAlumno(alumnoId);
      toast.success("PDF de matrícula descargado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo descargar el PDF.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("gap-2", className)}
      disabled={isDownloading}
      onClick={(event) => {
        void handleDownload(event);
      }}
    >
      {isDownloading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Download className="h-4 w-4" aria-hidden />
      )}
      {label}
    </Button>
  );
}
