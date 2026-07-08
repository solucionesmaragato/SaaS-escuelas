import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Loader2, Music4, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { downloadRealSepaPdf, MANDATO_SEPA_PDF_SELECT } from "@/lib/generateSepaPdf";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type FirmarSepaSearch = {
  token?: string;
};

type MandatoSepaAlumnoRow = {
  NOMBRE_ALUMNO: string | null;
  IBAN: string | null;
  TITULAR_CUENTA: string | null;
};

type MandatoSepaClienteRow = {
  NOMBRE_ESCUELA: string | null;
  CIF: string | null;
  DIRECCION: string | null;
  IDENTIFICADOR_ACREEDOR: string | null;
};

type MandatoSepaCentroRow = {
  NOMBRE_CENTRO: string | null;
};

type MandatoSepaRow = {
  TOKEN_PUBLICO: string;
  ESTADO: string | null;
  FIRMADO_AT: string | null;
  IP_DIRECCION: string | null;
  USER_AGENT: string | null;
  HASH_EVIDENCIA: string | null;
  ALUMNOS: MandatoSepaAlumnoRow | MandatoSepaAlumnoRow[] | null;
  CLIENTES: MandatoSepaClienteRow | MandatoSepaClienteRow[] | null;
  CENTROS: MandatoSepaCentroRow | MandatoSepaCentroRow[] | null;
};

const MANDATO_SEPA_SELECT = MANDATO_SEPA_PDF_SELECT;

const SEPA_LEGAL_TEXT = [
  "Mediante la firma de esta orden de domiciliación, el deudor autoriza (A) al acreedor a enviar instrucciones a la entidad del deudor para adeudar su cuenta y (B) a la entidad para efectuar los adeudos conforme a las instrucciones del acreedor.",
  "Como parte de sus derechos, el deudor está legitimado al reembolso por su entidad en los términos y condiciones del contrato suscrito con la misma. La solicitud de reembolso deberá efectuarse dentro de las ocho semanas que siguen a la fecha de adeudo en cuenta.",
  "Puede obtener información adicional sobre sus derechos en su entidad financiera. Este mandato se emite exclusivamente para pagos domiciliados SEPA entre residentes en la Unión Europea.",
];

export const Route = createFileRoute("/firmar-sepa")({
  validateSearch: (search: Record<string, unknown>): FirmarSepaSearch => {
    const token = typeof search.token === "string" && search.token.trim() ? search.token : undefined;
    return { token };
  },
  component: FirmarSepaPage,
});

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() || "—";
}

function maskIban(iban: string | null | undefined): string {
  if (!iban?.trim()) return "—";
  const clean = iban.replace(/\s/g, "").toUpperCase();
  if (clean.length <= 8) return clean;
  const country = clean.slice(0, 4);
  const last4 = clean.slice(-4);
  return `${country} **** **** **** ${last4}`;
}

function isMandatoFirmado(estado: string | null | undefined): boolean {
  return estado?.trim().toLowerCase() === "firmado";
}

function FirmarSepaPage() {
  const { token } = Route.useSearch();
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [mandato, setMandato] = useState<MandatoSepaRow | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMandato() {
      if (!token?.trim()) {
        setLoadState("error");
        setLoadError("El enlace no incluye un token válido.");
        setMandato(null);
        return;
      }

      setLoadState("loading");
      setLoadError(null);

      const { data, error } = await supabase
        .from("MANDATOS_SEPA")
        .select(MANDATO_SEPA_SELECT)
        .eq("TOKEN_PUBLICO", token.trim())
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setLoadState("error");
        setLoadError(error.message);
        setMandato(null);
        return;
      }

      if (!data) {
        setLoadState("error");
        setLoadError("No se encontró un mandato SEPA para este enlace.");
        setMandato(null);
        return;
      }

      const row = data as MandatoSepaRow;
      setMandato(row);
      setLoadState("ready");
      setIsSigned(isMandatoFirmado(row.ESTADO));
    }

    void loadMandato();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const alumno = useMemo(() => unwrapRelation(mandato?.ALUMNOS), [mandato]);
  const cliente = useMemo(() => unwrapRelation(mandato?.CLIENTES), [mandato]);
  const centro = useMemo(() => unwrapRelation(mandato?.CENTROS), [mandato]);

  const academyName = displayValue(cliente?.NOMBRE_ESCUELA);
  const centroName = displayValue(centro?.NOMBRE_CENTRO);
  const clienteCif = displayValue(cliente?.CIF);
  const clienteDireccion = displayValue(cliente?.DIRECCION);
  const alumnoNombre = displayValue(alumno?.NOMBRE_ALUMNO);
  const accountHolder =
    alumno?.TITULAR_CUENTA?.trim() || alumno?.NOMBRE_ALUMNO?.trim() || "—";
  const ibanDisplay = maskIban(alumno?.IBAN);
  const reference = displayValue(mandato?.TOKEN_PUBLICO ?? token);

  const handleSign = async () => {
    if (!token?.trim() || !consentAccepted || isSigning || isSigned) return;

    setIsSigning(true);
    try {
      const ipResponse = await fetch("https://api.ipify.org?format=json");
      const ipData = (await ipResponse.json()) as { ip?: string };
      const ipAddress = ipData.ip?.trim() || null;
      const userAgent = navigator.userAgent;
      const firmadoAt = new Date().toISOString();

      const { error } = await supabase
        .from("MANDATOS_SEPA")
        .update({
          ESTADO: "firmado",
          FIRMADO_AT: firmadoAt,
          IP_DIRECCION: ipAddress,
          USER_AGENT: userAgent,
        })
        .eq("TOKEN_PUBLICO", token.trim());

      if (error) throw error;

      setMandato((current) =>
        current
          ? {
              ...current,
              ESTADO: "firmado",
              FIRMADO_AT: firmadoAt,
              IP_DIRECCION: ipAddress,
              USER_AGENT: userAgent,
            }
          : current,
      );
      setIsSigned(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar la firma.");
    } finally {
      setIsSigning(false);
    }
  };

  const handleDownloadPdf = useCallback(async () => {
    if (isDownloading || !mandato || !token?.trim()) return;
    setIsDownloading(true);
    try {
      const { data, error } = await supabase
        .from("MANDATOS_SEPA")
        .select(MANDATO_SEPA_SELECT)
        .eq("TOKEN_PUBLICO", token.trim())
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error("No se encontró el mandato SEPA para generar el PDF.");
        return;
      }

      downloadRealSepaPdf(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo generar el PDF.");
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, mandato, token]);

  return (
    <div className="min-h-svh bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-lg">
        <Card className="overflow-hidden border-slate-200 bg-white shadow-lg shadow-slate-200/60">
          <CardHeader className="space-y-4 border-b border-slate-100 bg-white px-5 pb-5 pt-6 text-center sm:px-8 sm:pt-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
              <Music4 className="h-7 w-7" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {academyName}
              </p>
              <h1 className="text-balance text-lg font-semibold leading-snug text-slate-900 sm:text-xl">
                Autorización de Domiciliación Bancaria (Mandato SEPA)
              </h1>
              <p className="text-sm text-slate-600">{centroName}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="outline" className="border-slate-200 bg-slate-50 font-normal text-slate-600">
                Referencia {reference}
              </Badge>
              {token ? (
                <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                  Token verificado
                </Badge>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
            {loadState === "loading" ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
                <p className="text-sm text-slate-500">Cargando mandato SEPA…</p>
              </div>
            ) : loadState === "error" ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-6 text-center">
                <p className="text-sm font-medium text-destructive">
                  {loadError ?? "No se pudo cargar el mandato."}
                </p>
              </div>
            ) : isSigned ? (
              <SuccessState onDownload={handleDownloadPdf} downloading={isDownloading} />
            ) : (
              <>
                <section
                  aria-labelledby="sepa-creditor-details"
                  className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 sm:p-5"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-500" aria-hidden />
                    <h2
                      id="sepa-creditor-details"
                      className="text-sm font-semibold text-slate-800"
                    >
                      Datos del acreedor
                    </h2>
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                      <dt className="text-slate-500">Escuela</dt>
                      <dd className="font-medium text-slate-900">{academyName}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                      <dt className="text-slate-500">Centro</dt>
                      <dd className="font-medium text-slate-900">{centroName}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                      <dt className="text-slate-500">CIF</dt>
                      <dd className="font-mono text-sm font-medium text-slate-900">{clienteCif}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                      <dt className="text-slate-500">Dirección</dt>
                      <dd className="text-right font-medium text-slate-900 sm:max-w-[60%]">
                        {clienteDireccion}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section
                  aria-labelledby="sepa-account-details"
                  className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 sm:p-5"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-500" aria-hidden />
                    <h2
                      id="sepa-account-details"
                      className="text-sm font-semibold text-slate-800"
                    >
                      Datos del mandato
                    </h2>
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                      <dt className="text-slate-500">Alumno</dt>
                      <dd className="font-medium text-slate-900">{alumnoNombre}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                      <dt className="text-slate-500">Titular de la cuenta</dt>
                      <dd className="font-medium text-slate-900">{accountHolder}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                      <dt className="text-slate-500">IBAN</dt>
                      <dd className="font-mono text-sm font-medium tracking-wide text-slate-900">
                        {ibanDisplay}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                      <dt className="text-slate-500">Referencia del mandato</dt>
                      <dd className="break-all font-mono text-xs font-medium text-slate-800 sm:text-sm">
                        {reference}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section aria-labelledby="sepa-legal-text" className="space-y-2">
                  <h2 id="sepa-legal-text" className="sr-only">
                    Texto legal del mandato
                  </h2>
                  <div className="space-y-3 rounded-lg border border-slate-100 bg-white p-4 text-[11px] leading-relaxed text-slate-500 sm:text-xs">
                    {SEPA_LEGAL_TEXT.map((paragraph) => (
                      <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                    ))}
                  </div>
                </section>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <label
                    htmlFor="sepa-consent"
                    className="flex cursor-pointer items-start gap-3"
                  >
                    <Checkbox
                      id="sepa-consent"
                      checked={consentAccepted}
                      onCheckedChange={(checked) => setConsentAccepted(checked === true)}
                      disabled={isSigning}
                      className="mt-0.5"
                    />
                    <span className="text-sm leading-relaxed text-slate-700">
                      He leído y acepto el mandato SEPA. Autorizo el registro de mi dirección IP
                      y huella digital como evidencia legal de firma.
                    </span>
                  </label>
                </div>

                <Button
                  type="button"
                  size="lg"
                  className="h-12 w-full text-base font-semibold"
                  disabled={!consentAccepted || isSigning}
                  onClick={() => void handleSign()}
                >
                  {isSigning ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                      Registrando firma…
                    </>
                  ) : (
                    "Firmar Mandato Digitalmente"
                  )}
                </Button>

                <p className="text-center text-[11px] text-slate-400">
                  Documento generado electrónicamente. Conexión segura cifrada TLS.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} {academyName} · Firma digital SEPA
        </p>
      </div>
    </div>
  );
}

function SuccessState({
  onDownload,
  downloading,
}: {
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-2 py-8 text-center sm:py-12",
        "animate-in fade-in zoom-in-95 duration-500",
      )}
    >
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/80">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" strokeWidth={1.75} aria-hidden />
      </div>
      <Badge className="mb-4 bg-emerald-600 hover:bg-emerald-600">Firmado</Badge>
      <h2 className="text-balance text-xl font-semibold text-slate-900 sm:text-2xl">
        Mandato Firmado y Registrado Correctamente
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-500">
        Hemos registrado su autorización de domiciliación bancaria. Recibirá una copia en su
        correo electrónico en los próximos minutos.
      </p>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="mt-6 w-full sm:w-auto"
        disabled={downloading}
        onClick={onDownload}
      >
        {downloading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="mr-2 h-4 w-4" aria-hidden />
        )}
        Descargar copia en PDF
      </Button>
    </div>
  );
}
