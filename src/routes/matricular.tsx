import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Download, Loader2, ShieldCheck } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  METODOS_PAGO_OPCIONES,
  isBankRemittancePaymentMethod,
  isBizumPaymentMethod,
  normalizeMetodoPago,
} from "@/lib/alumnoPaymentUtils";
import { buildMatriculaEvidenceString } from "@/lib/matriculaEvidence";
import {
  computeMatriculaHashEvidence,
  downloadMatriculaPdf,
} from "@/lib/generateMatriculaPdf";
import {
  type FirmarSolicitudMatriculaPayload,
  type SolicitudMatriculaDatos,
  type SolicitudMatriculaPublica,
  type SolicitudMatriculaTextos,
  isSolicitudFirmada,
} from "@/lib/solicitudMatricula";
import {
  buildMatriculaPdfTextosLegalesFromSolicitud,
  getMatriculaTextoLabel,
} from "@/lib/matriculaTextosLabels";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type MatricularSearch = {
  token?: string;
};

type FormState = SolicitudMatriculaDatos & {
  nombreFirmante: string;
  dniFirmante: string;
  aceptaRegimen: boolean;
  autMedios: boolean;
  autInstalaciones: boolean;
  autWeb: boolean;
  autRrss: boolean;
  autComunicacion: boolean;
  consentFirma: boolean;
};

type LegalDocKey =
  | "regimen"
  | "autMedios"
  | "autInstalaciones"
  | "autWeb"
  | "autRrss"
  | "autComunicacion";

const INITIAL_READ_DOCS: Record<LegalDocKey, boolean> = {
  regimen: false,
  autMedios: false,
  autInstalaciones: false,
  autWeb: false,
  autRrss: false,
  autComunicacion: false,
};

const EMPTY_FORM: FormState = {
  NOMBRE_ALUMNO: "",
  DNI: "",
  MAIL: "",
  TLF_ALUMNO: "",
  TLF_COMUNICACION: "",
  NOMBRE_MADRE: "",
  TLF_MADRE: "",
  NOMBRE_PADRE: "",
  TLF_PADRE: "",
  DIRECCION: "",
  CP: "",
  MUNICIPIO: "",
  PROVINCIA: "",
  NACIMIENTO: "",
  METODO_PAGO: "",
  IBAN: "",
  TITULAR_CUENTA: "",
  TLF_BIZUM: "",
  nombreFirmante: "",
  dniFirmante: "",
  aceptaRegimen: false,
  autMedios: false,
  autInstalaciones: false,
  autWeb: false,
  autRrss: false,
  autComunicacion: false,
  consentFirma: false,
};

function datosToForm(datos: SolicitudMatriculaDatos | undefined): Partial<FormState> {
  if (!datos) return {};
  return {
    NOMBRE_ALUMNO: datos.NOMBRE_ALUMNO ?? "",
    DNI: datos.DNI ?? "",
    MAIL: datos.MAIL ?? "",
    TLF_ALUMNO: datos.TLF_ALUMNO ?? "",
    TLF_COMUNICACION: datos.TLF_COMUNICACION ?? "",
    NOMBRE_MADRE: datos.NOMBRE_MADRE ?? "",
    TLF_MADRE: datos.TLF_MADRE ?? "",
    NOMBRE_PADRE: datos.NOMBRE_PADRE ?? "",
    TLF_PADRE: datos.TLF_PADRE ?? "",
    DIRECCION: datos.DIRECCION ?? "",
    CP: datos.CP ?? "",
    MUNICIPIO: datos.MUNICIPIO ?? "",
    PROVINCIA: datos.PROVINCIA ?? "",
    NACIMIENTO: datos.NACIMIENTO ?? "",
    METODO_PAGO: datos.METODO_PAGO ?? "",
    IBAN: datos.IBAN ?? "",
    TITULAR_CUENTA: datos.TITULAR_CUENTA ?? "",
    TLF_BIZUM: datos.TLF_BIZUM ?? "",
  };
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() || "—";
}

export const Route = createFileRoute("/matricular")({
  validateSearch: (search: Record<string, unknown>): MatricularSearch => {
    const token =
      typeof search.token === "string" && search.token.trim() ? search.token : undefined;
    return { token };
  },
  component: MatricularPage,
});

function MatricularPage() {
  const { token } = Route.useSearch();
  const [solicitud, setSolicitud] = useState<SolicitudMatriculaPublica | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [signedMeta, setSignedMeta] = useState<{
    firmadoAt: string;
    nombreFirmante: string;
    dniFirmante: string;
    hashEvidencia: string;
    ipDireccion: string | null;
    userAgent: string | null;
    textosLegales: SolicitudMatriculaTextos | null;
  } | null>(null);
  const [readDocs, setReadDocs] = useState(INITIAL_READ_DOCS);
  const [legalModal, setLegalModal] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSolicitud() {
      if (!token?.trim()) {
        setLoadState("error");
        setLoadError("El enlace no incluye un token válido.");
        setSolicitud(null);
        return;
      }

      setLoadState("loading");
      setLoadError(null);

      const { data, error } = await supabase.rpc("obtener_solicitud_matricula_publica", {
        p_token: token.trim(),
      });

      if (cancelled) return;

      if (error) {
        setLoadState("error");
        setLoadError(error.message);
        setSolicitud(null);
        return;
      }

      const row = data as SolicitudMatriculaPublica;
      if (!row?.ok) {
        setLoadState("error");
        setLoadError(row?.error ?? "No se pudo cargar la solicitud.");
        setSolicitud(null);
        return;
      }

      setSolicitud(row);
      setForm((current) => ({
        ...EMPTY_FORM,
        ...datosToForm(row.datos),
        nombreFirmante: row.firma?.nombre_firmante ?? current.nombreFirmante,
        dniFirmante: row.firma?.dni_firmante ?? current.dniFirmante,
      }));
      setLoadState("ready");
      setIsSigned(isSolicitudFirmada(row.estado));
      if (row.firma?.firmado_at) {
        setSignedMeta({
          firmadoAt: row.firma.firmado_at,
          nombreFirmante: row.firma.nombre_firmante ?? "",
          dniFirmante: row.firma.dni_firmante ?? "",
          hashEvidencia: "",
          ipDireccion: null,
          userAgent: null,
          textosLegales: row.datos?.TEXTOS_LEGALES ?? row.textos ?? null,
        });
      }
    }

    void loadSolicitud();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const academyName = displayValue(solicitud?.escuela?.nombre_escuela);
  const centroName = displayValue(solicitud?.centro?.nombre_centro);
  const textos = solicitud?.textos;
  const metodoPago = normalizeMetodoPago(form.METODO_PAGO);
  const showSepaFields = isBankRemittancePaymentMethod(metodoPago);
  const showBizumField = isBizumPaymentMethod(metodoPago);

  const autorizacionesLabels = useMemo(
    () => [
      {
        key: "autMedios" as const,
        readKey: "autMedios" as const,
        label: getMatriculaTextoLabel("TEXTO_AUT_MEDIOS"),
        texto: textos?.aut_medios,
      },
      {
        key: "autInstalaciones" as const,
        readKey: "autInstalaciones" as const,
        label: getMatriculaTextoLabel("TEXTO_AUT_INSTALACIONES"),
        texto: textos?.aut_instalaciones,
      },
      {
        key: "autWeb" as const,
        readKey: "autWeb" as const,
        label: getMatriculaTextoLabel("TEXTO_AUT_WEB"),
        texto: textos?.aut_web,
      },
      {
        key: "autRrss" as const,
        readKey: "autRrss" as const,
        label: getMatriculaTextoLabel("TEXTO_AUT_RRSS"),
        texto: textos?.aut_rrss,
      },
      {
        key: "autComunicacion" as const,
        readKey: "autComunicacion" as const,
        label: getMatriculaTextoLabel("TEXTO_AUT_COMUNICACION"),
        texto: textos?.aut_comunicacion,
      },
    ],
    [textos],
  );

  const textosConfigurados = Boolean(
    textos?.regimen_interno?.trim() &&
      textos?.aut_medios?.trim() &&
      textos?.aut_instalaciones?.trim() &&
      textos?.aut_web?.trim() &&
      textos?.aut_rrss?.trim() &&
      textos?.aut_comunicacion?.trim(),
  );

  const todosLeidos = Object.values(readDocs).every(Boolean);

  const openLegalDoc = (readKey: LegalDocKey, title: string, body: string) => {
    setReadDocs((current) => ({ ...current, [readKey]: true }));
    setLegalModal({ title, body });
  };

  const canSubmit =
    textosConfigurados &&
    todosLeidos &&
    form.nombreFirmante.trim() &&
    form.dniFirmante.trim() &&
    form.NOMBRE_ALUMNO?.trim() &&
    form.aceptaRegimen &&
    form.autMedios &&
    form.autInstalaciones &&
    form.autWeb &&
    form.autRrss &&
    form.autComunicacion &&
    form.consentFirma &&
    !isSigning &&
    !isSigned &&
    solicitud?.estado === "pendiente" &&
    !solicitud?.expirada;

  const setField = (key: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSign = async () => {
    if (!token?.trim() || !canSubmit) return;

    setIsSigning(true);
    try {
      const ipResponse = await fetch("https://api.ipify.org?format=json");
      const ipData = (await ipResponse.json()) as { ip?: string };
      const ipAddress = ipData.ip?.trim() || null;
      const userAgent = navigator.userAgent;
      const firmadoAt = new Date().toISOString();
      const metodo = normalizeMetodoPago(form.METODO_PAGO) || form.METODO_PAGO?.trim() || null;

      const payload: FirmarSolicitudMatriculaPayload = {
        NOMBRE_ALUMNO: form.NOMBRE_ALUMNO?.trim() || null,
        DNI: form.DNI?.trim() || null,
        MAIL: form.MAIL?.trim() || null,
        TLF_ALUMNO: form.TLF_ALUMNO?.trim() || null,
        TLF_COMUNICACION: form.TLF_COMUNICACION?.trim() || null,
        NOMBRE_MADRE: form.NOMBRE_MADRE?.trim() || null,
        TLF_MADRE: form.TLF_MADRE?.trim() || null,
        NOMBRE_PADRE: form.NOMBRE_PADRE?.trim() || null,
        TLF_PADRE: form.TLF_PADRE?.trim() || null,
        DIRECCION: form.DIRECCION?.trim() || null,
        CP: form.CP?.trim() || null,
        MUNICIPIO: form.MUNICIPIO?.trim() || null,
        PROVINCIA: form.PROVINCIA?.trim() || null,
        NACIMIENTO: form.NACIMIENTO?.trim() || null,
        METODO_PAGO: metodo,
        IBAN: showSepaFields ? form.IBAN?.trim() || null : null,
        TITULAR_CUENTA: showSepaFields ? form.TITULAR_CUENTA?.trim() || null : null,
        TLF_BIZUM: showBizumField ? form.TLF_BIZUM?.trim() || null : null,
        DNI_FIRMANTE: form.dniFirmante.trim(),
        acepta_regimen: form.aceptaRegimen,
        AUT_MEDIOS: form.autMedios,
        AUT_INSTALACIONES: form.autInstalaciones,
        AUT_WEB: form.autWeb,
        AUT_RRSS: form.autRrss,
        AUT_COMUNICACION_TOTAL: form.autComunicacion,
      };

      const hashEvidencia = await computeMatriculaHashEvidence(
        buildMatriculaEvidenceString(
          payload,
          form.nombreFirmante.trim(),
          form.dniFirmante.trim(),
          token.trim(),
        ),
      );

      const { data, error } = await supabase.rpc("firmar_solicitud_matricula", {
        p_token: token.trim(),
        p_datos: payload,
        p_nombre_firmante: form.nombreFirmante.trim(),
        p_ip: ipAddress,
        p_user_agent: userAgent,
        p_hash_evidencia: hashEvidencia,
        p_pdf_url: `client://matricula/${token.trim()}`,
      });

      if (error) throw error;

      const result = data as { ok?: boolean; error?: string };
      if (!result?.ok) {
        throw new Error(result?.error ?? "No se pudo registrar la firma.");
      }

      setSignedMeta({
        firmadoAt,
        nombreFirmante: form.nombreFirmante.trim(),
        dniFirmante: form.dniFirmante.trim(),
        hashEvidencia,
        ipDireccion: ipAddress,
        userAgent,
        textosLegales: solicitud?.textos ?? null,
      });
      setIsSigned(true);
      setSolicitud((current) =>
        current
          ? {
              ...current,
              estado: "firmada",
              datos: {
                ...(current.datos ?? {}),
                TEXTOS_LEGALES: solicitud?.textos ?? undefined,
              },
              firma: {
                nombre_firmante: form.nombreFirmante.trim(),
                dni_firmante: form.dniFirmante.trim(),
                firmado_at: firmadoAt,
                pdf_url: `client://matricula/${token.trim()}`,
              },
            }
          : current,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar la firma.");
    } finally {
      setIsSigning(false);
    }
  };

  const handleDownloadPdf = useCallback(() => {
    if (isDownloading || !solicitud) return;
    setIsDownloading(true);
    try {
      downloadMatriculaPdf({
        nombreEscuela: solicitud.escuela?.nombre_escuela,
        cif: solicitud.escuela?.cif,
        direccionEscuela: solicitud.escuela?.direccion,
        nombreCentro: solicitud.centro?.nombre_centro,
        nombreAlumno: form.NOMBRE_ALUMNO,
        nombreFirmante: signedMeta?.nombreFirmante ?? form.nombreFirmante,
        dniFirmante: signedMeta?.dniFirmante ?? form.dniFirmante,
        token,
        fechaFirma: signedMeta?.firmadoAt ?? solicitud.firma?.firmado_at,
        ipDireccion: signedMeta?.ipDireccion,
        userAgent: signedMeta?.userAgent,
        hashEvidencia: signedMeta?.hashEvidencia,
        metodoPago: normalizeMetodoPago(form.METODO_PAGO) || form.METODO_PAGO,
        autorizaciones: autorizacionesLabels.map((item) => item.label),
        textosLegales: buildMatriculaPdfTextosLegalesFromSolicitud(
          signedMeta?.textosLegales ?? solicitud.datos?.TEXTOS_LEGALES ?? solicitud.textos,
        ),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo generar el PDF.");
    } finally {
      setIsDownloading(false);
    }
  }, [autorizacionesLabels, form, isDownloading, signedMeta, solicitud, token]);

  return (
    <div className="min-h-svh bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Card className="overflow-hidden border-slate-200 bg-white shadow-lg shadow-slate-200/60">
          <CardHeader className="space-y-4 border-b border-slate-100 bg-white px-5 pb-5 pt-6 text-center sm:px-8 sm:pt-8">
            <div className="mx-auto flex justify-center">
              <AppLogo onLight className="max-h-20" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {academyName}
              </p>
              <h1 className="text-balance text-lg font-semibold leading-snug text-slate-900 sm:text-xl">
                Solicitud de matrícula online
              </h1>
              <p className="text-sm text-slate-600">{centroName}</p>
            </div>
            {token ? (
              <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                Token verificado
              </Badge>
            ) : null}
          </CardHeader>

          <CardContent className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
            {loadState === "loading" ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
                <p className="text-sm text-slate-500">Cargando solicitud de matrícula…</p>
              </div>
            ) : loadState === "error" ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-6 text-center">
                <p className="text-sm font-medium text-destructive">
                  {loadError ?? "No se pudo cargar la solicitud."}
                </p>
              </div>
            ) : solicitud?.expirada || solicitud?.estado === "expirada" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
                <p className="text-sm font-medium text-amber-900">
                  Este enlace de matrícula ha expirado. Contacte con la escuela para solicitar uno
                  nuevo.
                </p>
              </div>
            ) : isSigned ? (
              <SuccessState onDownload={handleDownloadPdf} downloading={isDownloading} />
            ) : (
              <form
                className="space-y-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSign();
                }}
              >
                <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/90 p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-500" aria-hidden />
                    <h2 className="text-sm font-semibold text-slate-800">Datos del alumno</h2>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Nombre del alumno *">
                      <Input
                        value={form.NOMBRE_ALUMNO ?? ""}
                        onChange={(e) => setField("NOMBRE_ALUMNO", e.target.value)}
                        required
                      />
                    </FormField>
                    <FormField label="DNI">
                      <Input
                        value={form.DNI ?? ""}
                        onChange={(e) => setField("DNI", e.target.value)}
                      />
                    </FormField>
                    <FormField label="Fecha de nacimiento">
                      <Input
                        type="date"
                        value={form.NACIMIENTO ?? ""}
                        onChange={(e) => setField("NACIMIENTO", e.target.value)}
                      />
                    </FormField>
                    <FormField label="Email">
                      <Input
                        type="email"
                        value={form.MAIL ?? ""}
                        onChange={(e) => setField("MAIL", e.target.value)}
                      />
                    </FormField>
                    <FormField label="Teléfono alumno">
                      <Input
                        value={form.TLF_ALUMNO ?? ""}
                        onChange={(e) => setField("TLF_ALUMNO", e.target.value)}
                      />
                    </FormField>
                    <FormField label="Teléfono comunicación">
                      <Input
                        value={form.TLF_COMUNICACION ?? ""}
                        onChange={(e) => setField("TLF_COMUNICACION", e.target.value)}
                      />
                    </FormField>
                  </div>
                </section>

                <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/90 p-4 sm:p-5">
                  <h2 className="text-sm font-semibold text-slate-800">Tutores</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Nombre tutor A">
                      <Input
                        value={form.NOMBRE_MADRE ?? ""}
                        onChange={(e) => setField("NOMBRE_MADRE", e.target.value)}
                      />
                    </FormField>
                    <FormField label="Teléfono tutor A">
                      <Input
                        value={form.TLF_MADRE ?? ""}
                        onChange={(e) => setField("TLF_MADRE", e.target.value)}
                      />
                    </FormField>
                    <FormField label="Nombre tutor B">
                      <Input
                        value={form.NOMBRE_PADRE ?? ""}
                        onChange={(e) => setField("NOMBRE_PADRE", e.target.value)}
                      />
                    </FormField>
                    <FormField label="Teléfono tutor B">
                      <Input
                        value={form.TLF_PADRE ?? ""}
                        onChange={(e) => setField("TLF_PADRE", e.target.value)}
                      />
                    </FormField>
                  </div>
                </section>

                <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/90 p-4 sm:p-5">
                  <h2 className="text-sm font-semibold text-slate-800">Domicilio</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Dirección" className="sm:col-span-2">
                      <Input
                        value={form.DIRECCION ?? ""}
                        onChange={(e) => setField("DIRECCION", e.target.value)}
                      />
                    </FormField>
                    <FormField label="CP">
                      <Input value={form.CP ?? ""} onChange={(e) => setField("CP", e.target.value)} />
                    </FormField>
                    <FormField label="Municipio">
                      <Input
                        value={form.MUNICIPIO ?? ""}
                        onChange={(e) => setField("MUNICIPIO", e.target.value)}
                      />
                    </FormField>
                    <FormField label="Provincia">
                      <Input
                        value={form.PROVINCIA ?? ""}
                        onChange={(e) => setField("PROVINCIA", e.target.value)}
                      />
                    </FormField>
                  </div>
                </section>

                <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/90 p-4 sm:p-5">
                  <h2 className="text-sm font-semibold text-slate-800">Forma de pago</h2>
                  <FormField label="Método de pago">
                    <Select
                      value={metodoPago || undefined}
                      onValueChange={(value) => setField("METODO_PAGO", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona método de pago" />
                      </SelectTrigger>
                      <SelectContent>
                        {METODOS_PAGO_OPCIONES.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  {showSepaFields ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="IBAN">
                        <Input
                          value={form.IBAN ?? ""}
                          onChange={(e) => setField("IBAN", e.target.value)}
                        />
                      </FormField>
                      <FormField label="Titular cuenta">
                        <Input
                          value={form.TITULAR_CUENTA ?? ""}
                          onChange={(e) => setField("TITULAR_CUENTA", e.target.value)}
                        />
                      </FormField>
                    </div>
                  ) : null}
                  {showBizumField ? (
                    <FormField label="Teléfono Bizum">
                      <Input
                        value={form.TLF_BIZUM ?? ""}
                        onChange={(e) => setField("TLF_BIZUM", e.target.value)}
                      />
                    </FormField>
                  ) : null}
                </section>

                <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-sm font-semibold text-slate-800">
                      {getMatriculaTextoLabel("TEXTO_REGIMEN_INTERNO")}
                    </h2>
                    {textos?.regimen_interno?.trim() ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() =>
                          openLegalDoc(
                            "regimen",
                            getMatriculaTextoLabel("TEXTO_REGIMEN_INTERNO"),
                            textos.regimen_interno ?? "",
                          )
                        }
                      >
                        Leer documento
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="shrink-0" disabled>
                        No disponible — contacte con secretaría
                      </Button>
                    )}
                  </div>
                  <label className="flex cursor-pointer items-start gap-3">
                    <Checkbox
                      checked={form.aceptaRegimen}
                      onCheckedChange={(checked) => setField("aceptaRegimen", checked === true)}
                      disabled={!textos?.regimen_interno?.trim() || !readDocs.regimen}
                    />
                    <span className="text-sm leading-relaxed text-slate-700">
                      He leído y acepto el régimen interno de la escuela.
                    </span>
                  </label>
                </section>

                <section className="space-y-4">
                  <h2 className="text-sm font-semibold text-slate-800">Autorizaciones</h2>
                  {autorizacionesLabels.map((item) => {
                    const hasTexto = Boolean(item.texto?.trim());
                    return (
                      <div
                        key={item.key}
                        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm font-medium text-slate-700">{item.label}</p>
                          {hasTexto ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => openLegalDoc(item.readKey, item.label, item.texto ?? "")}
                            >
                              Ver texto
                            </Button>
                          ) : (
                            <Button type="button" variant="outline" size="sm" className="shrink-0" disabled>
                              No disponible — contacte con secretaría
                            </Button>
                          )}
                        </div>
                        <label className="flex cursor-pointer items-start gap-3">
                          <Checkbox
                            checked={form[item.key]}
                            onCheckedChange={(checked) => setField(item.key, checked === true)}
                            disabled={!hasTexto || !readDocs[item.readKey]}
                          />
                          <span className="text-sm leading-relaxed text-slate-700">
                            Acepto esta autorización.
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </section>

                <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/90 p-4 sm:p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Nombre completo del firmante *">
                      <Input
                        value={form.nombreFirmante}
                        onChange={(e) => setField("nombreFirmante", e.target.value)}
                        required
                      />
                    </FormField>
                    <FormField label="DNI del firmante *">
                      <Input
                        value={form.dniFirmante}
                        onChange={(e) => setField("dniFirmante", e.target.value)}
                        required
                      />
                    </FormField>
                  </div>
                  <label className="flex cursor-pointer items-start gap-3">
                    <Checkbox
                      checked={form.consentFirma}
                      onCheckedChange={(checked) => setField("consentFirma", checked === true)}
                      disabled={isSigning}
                    />
                    <span className="text-sm leading-relaxed text-slate-700">
                      Confirmo que los datos son correctos y autorizo el registro de mi dirección IP,
                      la información de mi navegador/dispositivo y la huella digital como evidencia
                      legal de firma.
                    </span>
                  </label>
                </section>

                <Button
                  type="submit"
                  size="lg"
                  className="h-12 w-full text-base font-semibold"
                  disabled={!canSubmit}
                >
                  {isSigning ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                      Registrando firma…
                    </>
                  ) : (
                    "Firmar matrícula digitalmente"
                  )}
                </Button>

                <p className="text-center text-[11px] text-slate-400">
                  Documento generado electrónicamente. Conexión segura cifrada TLS.
                </p>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} {academyName} · Matrícula online
        </p>
      </div>

      <Dialog open={legalModal !== null} onOpenChange={(open) => !open && setLegalModal(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{legalModal?.title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
            {legalModal?.body}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label>{label}</Label>
      {children}
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
      <Badge className="mb-4 bg-emerald-600 hover:bg-emerald-600">Firmada</Badge>
      <h2 className="text-balance text-xl font-semibold text-slate-900 sm:text-2xl">
        Matrícula firmada y registrada correctamente
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-500">
        Hemos registrado su solicitud de matrícula. El alumno queda en estado{" "}
        <strong>Preinscripción</strong> hasta que secretaría lo active en el sistema.
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
