import { useState } from "react";
import { Clock, FileDown, Link as LinkIcon, Loader2 } from "lucide-react";
import { useMandatoSepa } from "@/hooks/useMandatoSepa";
import { downloadRealSepaPdf, MANDATO_SEPA_PDF_SELECT } from "@/lib/generateSepaPdf";
import {
  buildSepaMandateSignLink,
  fetchMandatoSepaByAlumnoId,
  parseMandatoSepaStatus,
  type MandatoSepaRow,
} from "@/lib/mandatosSepa";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

type SepaMandatoBlockProps = {
  alumnoId: string | null;
  /** @deprecated Kept for call-site compatibility; mandate rows are DB-trigger managed. */
  idCliente?: string | null;
  alumnoNombre: string;
  /** When true, shows the copy-link action for admins (edit form). */
  interactive?: boolean;
  /** Disables copy until the alumno row exists (create mode). */
  createMode?: boolean;
  disabled?: boolean;
};

const fieldLabelClassName =
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70";

const createModeCopyHint = "El enlace estará disponible tras guardar al alumno";

function formatMandatoShortDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function formatHistoryMandatoLabel(mandato: MandatoSepaRow): string {
  const status = parseMandatoSepaStatus(mandato.ESTADO);
  const dateIso =
    status === "revocado"
      ? mandato.created_at
      : (mandato.FIRMADO_AT ?? mandato.created_at);
  const dateLabel = formatMandatoShortDate(dateIso);

  if (status === "revocado") return `Revocado el ${dateLabel}`;
  if (status === "firmado") return `Firmado el ${dateLabel}`;
  return `Pendiente el ${dateLabel}`;
}

function CurrentMandatoBadge({ estado }: { estado: string | null | undefined }) {
  const status = parseMandatoSepaStatus(estado);

  if (status === "firmado") {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-green-100 text-green-800 hover:bg-green-100"
      >
        Firmado
      </Badge>
    );
  }

  if (status === "revocado") {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-slate-100 text-slate-700 hover:bg-slate-100"
      >
        Revocado
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-transparent bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
    >
      Pendiente de firma
    </Badge>
  );
}

function downloadArchivedMandatoPdf(pdfUrl: string | null | undefined) {
  const url = pdfUrl?.trim();
  if (!url) {
    toast.error("No hay PDF archivado para este mandato.");
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
}

export function SepaMandatoBlock({
  alumnoId,
  alumnoNombre: _alumnoNombre,
  interactive = false,
  createMode = false,
  disabled = false,
}: SepaMandatoBlockProps) {
  const { data, isLoading, isError } = useMandatoSepa(alumnoId);
  const mandato = data?.current ?? null;
  const history = data?.history ?? [];
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadingHistoryToken, setDownloadingHistoryToken] = useState<string | null>(null);

  const status = parseMandatoSepaStatus(mandato?.ESTADO);
  const isFirmado = status === "firmado";
  const copyDisabled = disabled || isCopying || createMode || !alumnoId;
  const showHistory = history.length > 0;

  const handleCopyLink = async () => {
    if (copyDisabled) return;

    setIsCopying(true);
    try {
      const row = mandato?.TOKEN_PUBLICO ? mandato : await fetchMandatoSepaByAlumnoId(alumnoId!);
      if (!row?.TOKEN_PUBLICO) {
        toast.error(
          "No se encontró el mandato SEPA. Guarda el alumno con método de pago SEPA primero.",
        );
        return;
      }

      const link = buildSepaMandateSignLink(row.TOKEN_PUBLICO);
      await navigator.clipboard.writeText(link);
      toast.success(`Enlace copiado al portapapeles: ${link}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo copiar el enlace SEPA.");
    } finally {
      setIsCopying(false);
    }
  };

  const handleDownloadCurrentPdf = async () => {
    if (disabled || isDownloading || !alumnoId || !mandato?.TOKEN_PUBLICO) return;
    setIsDownloading(true);
    try {
      const { data: mandatoRow, error } = await supabase
        .from("MANDATOS_SEPA")
        .select(MANDATO_SEPA_PDF_SELECT)
        .eq("TOKEN_PUBLICO", mandato.TOKEN_PUBLICO)
        .maybeSingle();

      if (error) throw error;
      if (!mandatoRow) {
        toast.error("No se encontro el mandato SEPA para este alumno.");
        return;
      }

      downloadRealSepaPdf(mandatoRow);
      toast.success("Documento SEPA descargado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo generar el PDF.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadHistoryPdf = async (entry: MandatoSepaRow) => {
    if (disabled || downloadingHistoryToken) return;

    const archivedUrl = entry.PDF_URL?.trim();
    if (archivedUrl) {
      downloadArchivedMandatoPdf(archivedUrl);
      return;
    }

    setDownloadingHistoryToken(entry.TOKEN_PUBLICO);
    try {
      const { data: mandatoRow, error } = await supabase
        .from("MANDATOS_SEPA")
        .select(MANDATO_SEPA_PDF_SELECT)
        .eq("TOKEN_PUBLICO", entry.TOKEN_PUBLICO)
        .maybeSingle();

      if (error) throw error;
      if (!mandatoRow) {
        toast.error("No se encontro el mandato archivado.");
        return;
      }

      downloadRealSepaPdf(mandatoRow);
      toast.success("Documento SEPA archivado descargado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo descargar el PDF archivado.");
    } finally {
      setDownloadingHistoryToken(null);
    }
  };

  const copyLinkButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      disabled={copyDisabled}
      aria-label="Copiar enlace de firma SEPA"
      onClick={() => void handleCopyLink()}
    >
      {isCopying ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <LinkIcon className="h-4 w-4" aria-hidden />
      )}
    </Button>
  );

  const historyMenu = showHistory ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground"
          disabled={disabled}
          aria-label="Ver historial de mandatos SEPA"
        >
          <Clock className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Historial de mandatos
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {history.map((entry) => {
          const isHistoryDownloading = downloadingHistoryToken === entry.TOKEN_PUBLICO;
          return (
            <DropdownMenuItem
              key={entry.TOKEN_PUBLICO}
              className="flex items-center justify-between gap-2"
              onSelect={(event) => event.preventDefault()}
            >
              <span className="truncate text-xs">{formatHistoryMandatoLabel(entry)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-red-600"
                disabled={disabled || isHistoryDownloading}
                aria-label={`Descargar PDF archivado: ${formatHistoryMandatoLabel(entry)}`}
                onClick={() => void handleDownloadHistoryPdf(entry)}
              >
                {isHistoryDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <FileDown className="h-3.5 w-3.5" aria-hidden />
                )}
              </Button>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  if (alumnoId && isLoading) {
    return (
      <div className="space-y-2">
        <p className={fieldLabelClassName}>Mandato SEPA Digital</p>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
        </div>
      </div>
    );
  }

  if (alumnoId && isError) {
    return (
      <div className="space-y-2">
        <p className={fieldLabelClassName}>Mandato SEPA Digital</p>
        <p className="text-xs text-destructive">No se pudo cargar el estado del mandato.</p>
      </div>
    );
  }

  if (!mandato) {
    return (
      <div className="space-y-2">
        <p className={fieldLabelClassName}>Mandato SEPA Digital</p>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-transparent bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
          >
            Pendiente de firma
          </Badge>
          {interactive ? (
            createMode ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">{copyLinkButton}</span>
                  </TooltipTrigger>
                  <TooltipContent>{createModeCopyHint}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              copyLinkButton
            )
          ) : null}
        </div>
        {interactive && createMode ? (
          <p className="text-xs text-muted-foreground">{createModeCopyHint}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className={fieldLabelClassName}>Mandato SEPA Digital</p>
      <div className="flex items-center gap-2">
        <CurrentMandatoBadge estado={mandato.ESTADO} />
        {showHistory ? historyMenu : null}
        {isFirmado ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-red-600"
            disabled={disabled || isDownloading}
            aria-label="Descargar PDF del mandato SEPA"
            onClick={() => void handleDownloadCurrentPdf()}
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileDown className="h-5 w-5" aria-hidden />
            )}
          </Button>
        ) : interactive ? (
          createMode ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">{copyLinkButton}</span>
                </TooltipTrigger>
                <TooltipContent>{createModeCopyHint}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            copyLinkButton
          )
        ) : null}
      </div>
      {interactive && createMode ? (
        <p className="text-xs text-muted-foreground">{createModeCopyHint}</p>
      ) : null}
    </div>
  );
}
