import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import type { ControlRemesa, RemesaGeneracionJob, RemesaProcesoAlumno } from "@/types/database";
import {
  appendIdInFilter,
  centerFilterQueryKey,
  fetchAlumnoIdsForCenter,
} from "@/lib/centroFilter";
import { isBankRemittancePaymentMethod } from "@/lib/alumnoPaymentUtils";
import {
  buildReciboCobradoPatch,
  normalizeEstadoPago,
  type CobradoVerifactuEmisionResult,
} from "@/hooks/useRecibos";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";
import { sanitizeUserFacingError } from "@/lib/sanitizeUserFacingError";

export type ControlRemesaRow = ControlRemesa & {
  ID_CENTRO?: string | null;
  ID_CURSO?: string | null;
};

export type ControlRemesaUpdatePatch = Partial<
  Pick<
    ControlRemesa,
    "MES_PERIODO" | "ESTADO" | "LINK_XML_SEPA" | "LINK_EXCEL_CONTABILIDAD" | "LINK_RECIBOS_ZIP"
  >
>;

export type GenerarRemesaMensualInput = {
  p_id_cliente: string;
  p_id_centro: string;
  p_id_curso: string;
  p_mes_periodo: string;
};

export type EnviarRemesaBloqueInput = GenerarRemesaMensualInput & {
  p_id_recibos?: string[];
};

export type EnviarSepaReciboRow = {
  ID_RECIBO: string;
  ID_ALUMNO: string;
  alumnoNombre: string;
};

export type GenerarRemesaMensualResult = {
  status?: string;
  id_remesa?: string;
  recibos_generados?: number;
  mensaje?: string;
  [key: string]: unknown;
};

const GENERAR_REMESA_RPC_PARAMS = [
  "p_id_cliente",
  "p_id_centro",
  "p_id_curso",
  "p_mes_periodo",
] as const satisfies ReadonlyArray<keyof GenerarRemesaMensualInput>;

function isMissingRpcValue(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

export function buildGenerarRemesaRpcPayload(values: {
  id_cliente: string;
  id_centro: string;
  id_curso: string;
  mes_periodo: string;
}): GenerarRemesaMensualInput {
  return {
    p_id_cliente: String(values.id_cliente ?? "").trim(),
    p_id_centro: String(values.id_centro ?? "").trim(),
    p_id_curso: String(values.id_curso ?? "").trim(),
    p_mes_periodo: String(values.mes_periodo ?? "").trim(),
  };
}

export function buildEnviarRemesaRpcPayloadFromRow(row: {
  ID_CLIENTE?: string | null;
  ID_CENTRO?: string | null;
  ID_CURSO?: string | null;
  MES_PERIODO?: string | null;
}): EnviarRemesaBloqueInput {
  return buildGenerarRemesaRpcPayload({
    id_cliente: row.ID_CLIENTE ?? "",
    id_centro: row.ID_CENTRO ?? "",
    id_curso: row.ID_CURSO ?? "",
    mes_periodo: row.MES_PERIODO ?? "",
  });
}

export function assertGenerarRemesaRpcPayload(
  payload: GenerarRemesaMensualInput,
): GenerarRemesaMensualInput {
  for (const key of GENERAR_REMESA_RPC_PARAMS) {
    if (isMissingRpcValue(payload[key])) {
      console.error(`[generar_remesa_mensual] Missing required RPC parameter: ${key}`);
      throw new Error(`Falta el parámetro requerido: ${key}`);
    }
  }
  return payload;
}

export type RemesaEnvioValidationRow = {
  ID_CLIENTE?: string | null;
  MES_PERIODO?: string | null;
  ID_CURSO?: string | null;
  ID_CENTRO?: string | null;
};

type ReciboBankingRow = {
  RECEPTOR_NOMBRE?: string | null;
  CIF_DNI?: string | null;
  ID_ALUMNO?: string | null;
  METODO_PAGO?: string | null;
  ESTADO_PAGO?: string | null;
  ALUMNOS?:
    | { NOMBRE_ALUMNO?: string | null; IBAN?: string | null }
    | { NOMBRE_ALUMNO?: string | null; IBAN?: string | null }[]
    | null;
};

function isMissingBankingField(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function isReciboBankingIncomplete(recibo: ReciboBankingRow): boolean {
  const alumnos = recibo.ALUMNOS;
  const iban = Array.isArray(alumnos) ? alumnos[0]?.IBAN : alumnos?.IBAN;

  return (
    isMissingBankingField(iban) ||
    isMissingBankingField(recibo.RECEPTOR_NOMBRE) ||
    isMissingBankingField(recibo.CIF_DNI)
  );
}

function resolveIncompleteBankingDisplayName(recibo: ReciboBankingRow): string {
  const receptor = recibo.RECEPTOR_NOMBRE?.trim();
  if (receptor) return receptor;

  const alumnos = recibo.ALUMNOS;
  const alumnoNombre = Array.isArray(alumnos)
    ? alumnos[0]?.NOMBRE_ALUMNO?.trim()
    : alumnos?.NOMBRE_ALUMNO?.trim();
  if (alumnoNombre) return alumnoNombre;

  return "Sin nombre";
}

export function formatRemesaBankingValidationMessage(names: string[]): string {
  return `No se puede enviar la remesa. Los siguientes alumnos o tutores no tienen sus datos bancarios completos: ${names.join(", ")}.`;
}

function isEstadoActivoMatricula(estado: string | null | undefined): boolean {
  const value = estado?.trim().toLowerCase();
  return value === "activo" || value === "activa";
}

function hasAjusteExclusionJustification(alumno: {
  MOTIVO_AJUSTE?: string | null;
  AJUSTE_MANUAL_EUR?: number | null;
}): boolean {
  if (alumno.MOTIVO_AJUSTE?.trim()) return true;
  return Number(alumno.AJUSTE_MANUAL_EUR ?? 0) !== 0;
}

type ReciboLoteValidationRow = {
  ID_RECIBO: string;
  REF_RECIBO?: string | null;
  TOTAL_DOC?: number | null;
  ID_ALUMNO?: string | null;
  ALUMNOS?: { NOMBRE_ALUMNO?: string | null } | { NOMBRE_ALUMNO?: string | null }[] | null;
};

function resolveReciboAlumnoDisplayName(recibo: ReciboLoteValidationRow): string {
  const alumnos = recibo.ALUMNOS;
  const alumnoNombre = Array.isArray(alumnos)
    ? alumnos[0]?.NOMBRE_ALUMNO?.trim()
    : alumnos?.NOMBRE_ALUMNO?.trim();
  return alumnoNombre || "Sin nombre";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export const VERIFACTU_NO_DISPONIBLE_TOAST =
  "VERIFACTU NO DISPONIBLE, SE HA GENERADO LA REMESA Y SE HAN PASADO LOS RECIBOS DE SEPA A COBRADOS, PERO LAS FACTURAS NO SE HAN EMITIDO CON VERIFACTU NI DESCARGADO EN .ZIP.";

export const VERIFACTU_EXITO_TOAST =
  "GENERADO XML SEPA, DESCARGA DE FACTURAS, Y AGRUPACIÓN EN .ZIP LISTA PARA DESCARGA.";

/** Emisión Korefactu vía korefactu-emitir-factura (misma Edge que Facturas). */
export function isVerifactuRemesaEmitAvailable(): boolean {
  return true;
}

export type EmitKorefactuRemesaResult = {
  cobradosConUuid: string[];
  failures: Array<{ idRecibo: string; message: string }>;
  excelErrors: string[];
};

async function invokeKorefactuEmitirFacturaRemesa(
  idRecibo: string,
): Promise<CobradoVerifactuEmisionResult & { excelError: string | null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Tu sesión ha caducado. Cierra sesión y vuelve a entrar.");
  }

  const { data, error } = await supabase.functions.invoke("korefactu-emitir-factura", {
    body: { id_recibo: idRecibo },
  });

  const payload = data as {
    error?: string;
    link?: string | null;
    pdfDownloaded?: boolean;
    notification?: "success" | "pdf_missing";
    NUM_FACTURA_KOREFACTU?: string | null;
    LINK_FACTURA_KOREFACTU?: string | null;
    URL_QR?: string | null;
    HUELLA_HASH?: string | null;
    excel_error?: string | null;
  } | null;

  if (payload?.error?.trim()) {
    throw new Error(sanitizeUserFacingError(payload.error.trim()));
  }
  if (error) {
    const fromBody = await readFunctionsInvokeError(error);
    if (fromBody) throw new Error(sanitizeUserFacingError(fromBody));
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status === 401) {
      throw new Error("No autorizado para emitir la factura.");
    }
    throw new Error(
      sanitizeUserFacingError(
        error instanceof Error ? error.message : "Error al emitir la factura con Verifactu.",
      ),
    );
  }

  const link = payload?.link?.trim() || null;
  const hasEmission = payload?.LINK_FACTURA_KOREFACTU?.trim() || null;
  if (!hasEmission) {
    throw new Error("Verifactu no emitió la factura. El recibo sigue en Borrador.");
  }

  const pdfDownloaded = payload?.pdfDownloaded ?? Boolean(link);
  const notification =
    payload?.notification === "pdf_missing" || (!pdfDownloaded && hasEmission)
      ? "pdf_missing"
      : "success";

  return {
    linkPdfRecibo: link,
    notification,
    NUM_FACTURA_KOREFACTU: payload?.NUM_FACTURA_KOREFACTU ?? null,
    LINK_FACTURA_KOREFACTU: payload?.LINK_FACTURA_KOREFACTU ?? null,
    URL_QR: payload?.URL_QR ?? null,
    HUELLA_HASH: payload?.HUELLA_HASH ?? null,
    excelError: payload?.excel_error?.trim() || null,
  };
}

export async function emitKorefactuForRemesaRecibos(
  reciboIds: string[],
): Promise<EmitKorefactuRemesaResult> {
  if (reciboIds.length === 0) {
    return { cobradosConUuid: [], failures: [], excelErrors: [] };
  }

  const { data: recibos, error } = await supabase
    .from("RECIBOS_MENSUALES")
    .select(
      "ID_RECIBO, REF_RECIBO, ESTADO_PAGO, LINK_FACTURA_KOREFACTU, NUM_FACTURA_KOREFACTU, LINK_PDF_RECIBO, URL_QR, HUELLA_HASH",
    )
    .in("ID_RECIBO", reciboIds);
  if (error) throw error;

  const cobradosConUuid: string[] = [];
  const failures: Array<{ idRecibo: string; message: string }> = [];
  const excelErrorSet = new Set<string>();

  for (const recibo of recibos ?? []) {
    const idRecibo = recibo.ID_RECIBO;
    if (!idRecibo) continue;

    if (recibo.LINK_FACTURA_KOREFACTU?.trim()) {
      cobradosConUuid.push(idRecibo);
      continue;
    }

    if (normalizeEstadoPago(recibo.ESTADO_PAGO) !== "Borrador") {
      failures.push({
        idRecibo,
        message: `Recibo ${recibo.REF_RECIBO?.trim() || idRecibo}: no está en Borrador y no tiene factura Verifactu.`,
      });
      continue;
    }

    try {
      const verifactu = await invokeKorefactuEmitirFacturaRemesa(idRecibo);
      if (!verifactu.LINK_FACTURA_KOREFACTU?.trim()) {
        throw new Error("Verifactu no emitió la factura. El recibo sigue en Borrador.");
      }
      if (verifactu.excelError) {
        excelErrorSet.add(verifactu.excelError);
      }
      const { error: updateErr } = await supabase
        .from("RECIBOS_MENSUALES")
        .update(buildReciboCobradoPatch(verifactu))
        .eq("ID_RECIBO", idRecibo);
      if (updateErr) throw updateErr;
      cobradosConUuid.push(idRecibo);
    } catch (err) {
      failures.push({
        idRecibo,
        message:
          err instanceof Error
            ? sanitizeUserFacingError(err.message)
            : `Error al emitir factura Verifactu (${recibo.REF_RECIBO?.trim() || idRecibo}).`,
      });
    }
  }

  return { cobradosConUuid, failures, excelErrors: Array.from(excelErrorSet) };
}

export type EnviarRemesaFiscalNotification =
  | { kind: "none" }
  | { kind: "verifactu_unavailable" }
  | { kind: "verifactu_success" };

export function resolveEnviarRemesaFiscalNotification(
  xmlGenerated: boolean,
  cobradosCount: number,
): EnviarRemesaFiscalNotification {
  if (cobradosCount <= 0) return { kind: "none" };
  if (isVerifactuRemesaEmitAvailable()) {
    return xmlGenerated ? { kind: "verifactu_success" } : { kind: "none" };
  }
  return { kind: "verifactu_unavailable" };
}

export async function validateRemesaLoteBeforeEnviar(
  tenantId: string,
  rol: string | null | undefined,
  row: RemesaEnvioValidationRow,
): Promise<string[]> {
  const mesPeriodo = row.MES_PERIODO?.trim();
  const idCurso = row.ID_CURSO?.trim();
  const idCentro = row.ID_CENTRO?.trim();
  if (!mesPeriodo || !idCurso || !idCentro) return [];

  const errors: string[] = [];

  let recibosQuery = supabase
    .from("RECIBOS_MENSUALES")
    .select("ID_RECIBO, REF_RECIBO, TOTAL_DOC, ID_ALUMNO, ALUMNOS(NOMBRE_ALUMNO)")
    .eq("MES_PERIODO", mesPeriodo)
    .eq("ID_CURSO", idCurso)
    .eq("ID_CENTRO", idCentro);
  recibosQuery = scopeTenantQuery(recibosQuery, rol, tenantId);

  const { data: recibos, error: recibosErr } = await recibosQuery;
  if (recibosErr) throw recibosErr;

  const reciboList = (recibos ?? []) as ReciboLoteValidationRow[];
  const reciboIds = reciboList.map((recibo) => recibo.ID_RECIBO);

  const lineasByRecibo = new Map<string, { count: number; sum: number }>();
  if (reciboIds.length > 0) {
    const { data: lineas, error: lineasErr } = await supabase
      .from("VENTAS_LINEAS")
      .select("ID_RECIBO, SUBTOTAL")
      .in("ID_RECIBO", reciboIds);
    if (lineasErr) throw lineasErr;

    for (const linea of lineas ?? []) {
      const prev = lineasByRecibo.get(linea.ID_RECIBO) ?? { count: 0, sum: 0 };
      lineasByRecibo.set(linea.ID_RECIBO, {
        count: prev.count + 1,
        sum: prev.sum + Number(linea.SUBTOTAL ?? 0),
      });
    }
  }

  for (const recibo of reciboList) {
    const alumnoNombre = resolveReciboAlumnoDisplayName(recibo);
    const ref = recibo.REF_RECIBO?.trim() || recibo.ID_RECIBO;
    const lineStats = lineasByRecibo.get(recibo.ID_RECIBO) ?? { count: 0, sum: 0 };
    const totalDoc = Number(recibo.TOTAL_DOC ?? 0);

    if (lineStats.count === 0 || totalDoc === 0) {
      errors.push(`Recibo sin líneas o con importe cero: ${alumnoNombre} (${ref}).`);
      continue;
    }

    if (roundMoney(lineStats.sum) !== roundMoney(totalDoc)) {
      errors.push(
        `El total del recibo no coincide con la suma de líneas: ${alumnoNombre} (${ref}).`,
      );
    }
  }

  const reciboAlumnoIds = new Set(
    reciboList.map((recibo) => recibo.ID_ALUMNO).filter((id): id is string => Boolean(id)),
  );

  let matriculasQuery = supabase
    .from("MATRICULAS")
    .select("ID_ALUMNO, ESTADO")
    .eq("ID_CLIENTE", tenantId)
    .eq("ID_CENTRO", idCentro)
    .eq("ID_CURSO", idCurso);
  matriculasQuery = scopeTenantQuery(matriculasQuery, rol, tenantId);

  const { data: matriculas, error: matriculasErr } = await matriculasQuery;
  if (matriculasErr) throw matriculasErr;

  const matriculaActivaIds = new Set(
    (matriculas ?? [])
      .filter((matricula) => isEstadoActivoMatricula(matricula.ESTADO))
      .map((matricula) => matricula.ID_ALUMNO),
  );

  if (matriculaActivaIds.size > 0) {
    let alumnosQuery = supabase
      .from("ALUMNOS")
      .select("ID_ALUMNO, NOMBRE_ALUMNO, ESTADO_ALUMNO, MOTIVO_AJUSTE, AJUSTE_MANUAL_EUR")
      .eq("ID_CLIENTE", tenantId)
      .eq("ID_CENTRO", idCentro);
    alumnosQuery = scopeTenantQuery(alumnosQuery, rol, tenantId);

    const { data: alumnos, error: alumnosErr } = await alumnosQuery;
    if (alumnosErr) throw alumnosErr;

    const missingNames = (alumnos ?? [])
      .filter((alumno) => isEstadoActivoMatricula(alumno.ESTADO_ALUMNO))
      .filter((alumno) => matriculaActivaIds.has(alumno.ID_ALUMNO))
      .filter((alumno) => !reciboAlumnoIds.has(alumno.ID_ALUMNO))
      .filter((alumno) => !hasAjusteExclusionJustification(alumno))
      .map((alumno) => alumno.NOMBRE_ALUMNO?.trim() || "Sin nombre")
      .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

    if (missingNames.length > 0) {
      errors.push(
        `Alumnos con matrícula activa sin recibo en el lote: ${missingNames.join(", ")}.`,
      );
    }
  }

  return errors;
}

export async function fetchIncompleteRemesaBankingNames(
  tenantId: string,
  rol: string | null | undefined,
  row: RemesaEnvioValidationRow,
): Promise<string[]> {
  const mesPeriodo = row.MES_PERIODO?.trim();
  if (!mesPeriodo) return [];

  let query = supabase
    .from("RECIBOS_MENSUALES")
    .select(
      "RECEPTOR_NOMBRE, CIF_DNI, ID_ALUMNO, METODO_PAGO, ESTADO_PAGO, ALUMNOS(NOMBRE_ALUMNO, IBAN)",
    )
    .eq("MES_PERIODO", mesPeriodo);
  query = scopeTenantQuery(query, rol, tenantId);

  const idCurso = row.ID_CURSO?.trim();
  if (idCurso) {
    query = query.eq("ID_CURSO", idCurso);
  }

  const idCentro = row.ID_CENTRO?.trim();
  if (idCentro) {
    const alumnoIds = await fetchAlumnoIdsForCenter(tenantId, rol, idCentro);
    if (alumnoIds && alumnoIds.length === 0) return [];
    const scoped = appendIdInFilter(query, "ID_ALUMNO", alumnoIds);
    if (scoped === "empty") return [];
    query = scoped;
  }

  const { data, error } = await query;
  if (error) throw error;

  const names = new Set<string>();
  for (const recibo of (data ?? []) as ReciboBankingRow[]) {
    if (!isBankRemittancePaymentMethod(recibo.METODO_PAGO)) continue;
    if (normalizeEstadoPago(recibo.ESTADO_PAGO) !== "Borrador") continue;
    if (!isReciboBankingIncomplete(recibo)) continue;
    names.add(resolveIncompleteBankingDisplayName(recibo));
  }

  return [...names].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

function resolveReciboAlumnoNombre(recibo: {
  RECEPTOR_NOMBRE?: string | null;
  ALUMNOS?: { NOMBRE_ALUMNO?: string | null } | { NOMBRE_ALUMNO?: string | null }[] | null;
}): string {
  const alumnos = recibo.ALUMNOS;
  const alumnoNombre = Array.isArray(alumnos)
    ? alumnos[0]?.NOMBRE_ALUMNO?.trim()
    : alumnos?.NOMBRE_ALUMNO?.trim();
  return alumnoNombre || recibo.RECEPTOR_NOMBRE?.trim() || "Sin nombre";
}

export async function fetchSepaBorradorRecibosForEnviar(
  tenantId: string,
  rol: string | null | undefined,
  row: RemesaEnvioValidationRow,
): Promise<EnviarSepaReciboRow[]> {
  const mesPeriodo = row.MES_PERIODO?.trim();
  const idCurso = row.ID_CURSO?.trim();
  const idCentro = row.ID_CENTRO?.trim();
  if (!mesPeriodo || !idCurso || !idCentro) return [];

  let query = supabase
    .from("RECIBOS_MENSUALES")
    .select(
      "ID_RECIBO, ID_ALUMNO, METODO_PAGO, ESTADO_PAGO, RECEPTOR_NOMBRE, ALUMNOS(NOMBRE_ALUMNO)",
    )
    .eq("MES_PERIODO", mesPeriodo)
    .eq("ID_CURSO", idCurso)
    .eq("ID_CENTRO", idCentro);
  query = scopeTenantQuery(query, rol, tenantId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .filter(
      (recibo) =>
        isBankRemittancePaymentMethod(recibo.METODO_PAGO) &&
        normalizeEstadoPago(recibo.ESTADO_PAGO) === "Borrador",
    )
    .map((recibo) => ({
      ID_RECIBO: recibo.ID_RECIBO,
      ID_ALUMNO: recibo.ID_ALUMNO,
      alumnoNombre: resolveReciboAlumnoNombre(recibo),
    }))
    .filter((recibo): recibo is EnviarSepaReciboRow =>
      Boolean(recibo.ID_RECIBO && recibo.ID_ALUMNO),
    );
}

export async function fetchDuplicatePaymentConflicts(
  tenantId: string,
  rol: string | null | undefined,
  row: RemesaEnvioValidationRow,
  sepaRecibos: EnviarSepaReciboRow[],
): Promise<EnviarSepaReciboRow[]> {
  const mesPeriodo = row.MES_PERIODO?.trim();
  if (!mesPeriodo || sepaRecibos.length === 0) return [];

  const alumnoIds = [...new Set(sepaRecibos.map((recibo) => recibo.ID_ALUMNO))];

  let query = supabase
    .from("RECIBOS_MENSUALES")
    .select("ID_RECIBO, ID_ALUMNO, ESTADO_PAGO")
    .eq("MES_PERIODO", mesPeriodo)
    .in("ID_ALUMNO", alumnoIds);
  query = scopeTenantQuery(query, rol, tenantId);

  const { data, error } = await query;
  if (error) throw error;

  const cobradoReciboIdsByAlumno = new Map<string, Set<string>>();
  for (const recibo of data ?? []) {
    if (normalizeEstadoPago(recibo.ESTADO_PAGO) !== "Cobrado") continue;
    if (!recibo.ID_ALUMNO || !recibo.ID_RECIBO) continue;
    const prev = cobradoReciboIdsByAlumno.get(recibo.ID_ALUMNO) ?? new Set<string>();
    prev.add(recibo.ID_RECIBO);
    cobradoReciboIdsByAlumno.set(recibo.ID_ALUMNO, prev);
  }

  return sepaRecibos.filter((recibo) => {
    const cobrados = cobradoReciboIdsByAlumno.get(recibo.ID_ALUMNO);
    if (!cobrados || cobrados.size === 0) return false;
    for (const cobradoId of cobrados) {
      if (cobradoId !== recibo.ID_RECIBO) return true;
    }
    return false;
  });
}

async function readFunctionsInvokeError(error: unknown): Promise<string | null> {
  const context = (error as { context?: Response | { json?: () => Promise<unknown> } })?.context;
  if (!context) return null;
  try {
    if (typeof (context as Response).clone === "function") {
      const body = (await (context as Response).clone().json()) as { error?: string } | null;
      return body?.error?.trim() || null;
    }
    if (typeof context.json === "function") {
      const body = (await context.json()) as { error?: string } | null;
      return body?.error?.trim() || null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function invokeGenerarXmlSepaRemesa(
  input: GenerarRemesaMensualInput,
  idRecibosIncluidos?: string[],
): Promise<string | null> {
  const payload = assertGenerarRemesaRpcPayload({
    p_id_cliente: input.p_id_cliente,
    p_id_centro: input.p_id_centro,
    p_id_curso: input.p_id_curso,
    p_mes_periodo: input.p_mes_periodo,
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Tu sesión ha caducado. Cierra sesión y vuelve a entrar.");
  }

  const { data, error } = await supabase.functions.invoke("generar-xml-sepa-remesa", {
    body: {
      id_cliente: payload.p_id_cliente,
      id_centro: payload.p_id_centro,
      id_curso: payload.p_id_curso,
      mes_periodo: payload.p_mes_periodo,
      id_recibos_incluidos: idRecibosIncluidos,
    },
  });

  const response = data as { link?: string | null; error?: string; skipped?: boolean } | null;
  if (response?.error?.trim()) {
    throw new Error(response.error.trim());
  }

  if (error) {
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status === 401) {
      throw new Error("No autorizado para generar el XML SEPA.");
    }
    const fromBody = await readFunctionsInvokeError(error);
    throw new Error(
      fromBody || (error instanceof Error ? error.message : "Error al generar el XML SEPA."),
    );
  }

  const link = response?.link?.trim();
  if (!link) {
    return null;
  }
  return link;
}

export type GenerarZipRecibosRemesaResult = {
  link: string | null;
  skipped: boolean;
  pdfCount: number;
  missingAlumnos: string[];
};

/** Empaqueta solo PDF oficiales (`LINK_PDF_RECIBO`). Regenera el ZIP en cada llamada. */
export async function invokeGenerarZipRecibosRemesa(
  input: GenerarRemesaMensualInput,
): Promise<GenerarZipRecibosRemesaResult> {
  const payload = assertGenerarRemesaRpcPayload({
    p_id_cliente: input.p_id_cliente,
    p_id_centro: input.p_id_centro,
    p_id_curso: input.p_id_curso,
    p_mes_periodo: input.p_mes_periodo,
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Tu sesión ha caducado. Cierra sesión y vuelve a entrar.");
  }

  const { data, error } = await supabase.functions.invoke("generar-zip-recibos-remesa", {
    body: {
      id_cliente: payload.p_id_cliente,
      id_centro: payload.p_id_centro,
      id_curso: payload.p_id_curso,
      mes_periodo: payload.p_mes_periodo,
    },
  });

  if (error) {
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status === 401) {
      throw new Error("No autorizado para generar el ZIP de facturas.");
    }
    throw new Error(
      error instanceof Error ? error.message : "Error al generar el ZIP de facturas.",
    );
  }

  const response = data as {
    link?: string | null;
    error?: string;
    skipped?: boolean;
    pdf_count?: number;
    missing_alumnos?: unknown;
  } | null;
  if (response?.error) {
    throw new Error(response.error);
  }
  const link = response?.link?.trim() || null;
  const pdfCount = Number(response?.pdf_count ?? 0);
  const missingAlumnos = Array.isArray(response?.missing_alumnos)
    ? response.missing_alumnos
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
        .map((name) => name.trim())
    : [];
  if (!link) {
    return {
      link: null,
      skipped: response?.skipped === true || pdfCount === 0,
      pdfCount,
      missingAlumnos,
    };
  }
  return { link, skipped: false, pdfCount, missingAlumnos };
}

export async function encolarRemesaPostProceso(idRemesa: string): Promise<string> {
  const scopedId = idRemesa.trim();
  if (!scopedId) {
    throw new Error("Falta el identificador de la remesa.");
  }

  const { data, error } = await supabase.rpc("encolar_remesa_post_proceso", {
    p_id_remesa: scopedId,
  });
  if (error) throw error;
  if (!data) {
    throw new Error("No se pudo encolar el post-proceso de la remesa.");
  }
  return String(data);
}

export async function invokeProcesarRemesaJob(idJob: string): Promise<void> {
  const scopedId = idJob.trim();
  if (!scopedId) {
    throw new Error("Job de remesa no válido.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Tu sesión ha caducado. Cierra sesión y vuelve a entrar.");
  }

  const { data, error } = await supabase.functions.invoke("procesar-remesa-job", {
    body: {
      id_job: scopedId,
      access_token: session.access_token,
    },
  });

  const payload = data as { ok?: boolean; accepted?: boolean; error?: string } | null;
  if (payload?.error?.trim()) {
    throw new Error(sanitizeUserFacingError(payload.error.trim()));
  }

  if (error) {
    const fromBody = await readFunctionsInvokeError(error);
    if (fromBody) throw new Error(sanitizeUserFacingError(fromBody));
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status === 401) {
      throw new Error("No autorizado para procesar la remesa en segundo plano.");
    }
    throw new Error(
      sanitizeUserFacingError(
        error instanceof Error ? error.message : "Error al iniciar el post-proceso de la remesa.",
      ),
    );
  }
}

export async function fetchActiveRemesaGeneracionJobs(
  tenantId: string,
  rol: string | null | undefined,
): Promise<RemesaGeneracionJob[]> {
  let query = supabase
    .from("REMESA_GENERACION_JOBS")
    .select("*")
    .in("ESTADO", ["pendiente", "procesando"])
    .order("CREATED_AT", { ascending: false });
  query = scopeTenantQuery(query, rol, tenantId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as RemesaGeneracionJob[];
}

export async function resumePendingRemesaJobs(
  tenantId: string,
  rol: string | null | undefined,
): Promise<void> {
  const jobs = (await fetchActiveRemesaGeneracionJobs(tenantId, rol)).filter(
    (job) => job.ESTADO === "pendiente",
  );
  for (const job of jobs) {
    try {
      await invokeProcesarRemesaJob(job.ID_JOB);
    } catch (err) {
      console.error("[resumePendingRemesaJobs]", job.ID_JOB, err);
    }
  }
}

export async function fetchRemesaProcesoAlumnoPrefill(
  remesaId: string,
  alumnoId: string,
): Promise<RemesaProcesoAlumno | null> {
  const scopedRemesaId = remesaId.trim();
  const scopedAlumnoId = alumnoId.trim();
  if (!scopedRemesaId || !scopedAlumnoId) return null;

  const { data, error } = await supabase
    .from("REMESA_PROCESO_ALUMNO")
    .select("*")
    .eq("ID_REMESA", scopedRemesaId)
    .eq("ID_ALUMNO", scopedAlumnoId)
    .maybeSingle();
  if (error) throw error;
  return (data as RemesaProcesoAlumno | null) ?? null;
}

export async function registrarAvisoRemesaXmlFallido(
  input: GenerarRemesaMensualInput,
  errorMessage?: string | null,
): Promise<void> {
  const payload = assertGenerarRemesaRpcPayload({
    p_id_cliente: input.p_id_cliente,
    p_id_centro: input.p_id_centro,
    p_id_curso: input.p_id_curso,
    p_mes_periodo: input.p_mes_periodo,
  });

  const { error } = await supabase.rpc("fn_aviso_remesa_xml_fallido", {
    p_id_cliente: payload.p_id_cliente,
    p_id_centro: payload.p_id_centro,
    p_id_curso: payload.p_id_curso,
    p_mes_periodo: payload.p_mes_periodo,
    p_error: errorMessage?.trim() || null,
  });
  if (error) throw error;
}

export function remesaGeneracionJobsQueryKey(tenantId: string, rol: string | null | undefined) {
  return [...tenantListKey("remesa-jobs", rol, tenantId)] as const;
}

export function useRemesas(filterCenterId?: string | null) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("remesas", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async () => {
      // CONTROL_REMESAS is tenant-wide (no ID_CENTRO) — center filter not applied.
      void filterCenterId;
      // Leemos tu tabla CONTROL_REMESAS mapeada rigurosamente
      let query = supabase.from("CONTROL_REMESAS").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query.order("MES_PERIODO", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (input: Partial<ControlRemesa>) => {
      const payload = { ...input, ID_CLIENTE: tenantId };
      const { data, error } = await supabase
        .from("CONTROL_REMESAS")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ControlRemesaUpdatePatch }) => {
      const { data, error } = await supabase
        .from("CONTROL_REMESAS")
        .update(patch)
        .eq("ID_REMESA", id)
        .eq("ID_CLIENTE", tenantId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("CONTROL_REMESAS")
        .delete()
        .eq("ID_REMESA", id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const generarRemesaMensual = useMutation({
    mutationFn: async (input: GenerarRemesaMensualInput) => {
      const payload = assertGenerarRemesaRpcPayload({
        p_id_cliente: input.p_id_cliente,
        p_id_centro: input.p_id_centro,
        p_id_curso: input.p_id_curso,
        p_mes_periodo: input.p_mes_periodo,
      });

      const { data, error } = await supabase.rpc("generar_remesa_mensual", payload);
      if (error) throw error;
      return data as GenerarRemesaMensualResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: tenantListKey("recibos", rol, tenantId) });
    },
  });

  const enviarRemesaBloque = useMutation({
    mutationFn: async (input: EnviarRemesaBloqueInput) => {
      const payload = assertGenerarRemesaRpcPayload({
        p_id_cliente: input.p_id_cliente,
        p_id_centro: input.p_id_centro,
        p_id_curso: input.p_id_curso,
        p_mes_periodo: input.p_mes_periodo,
      });

      const rpcPayload: Record<string, unknown> = { ...payload };
      if (input.p_id_recibos !== undefined) {
        rpcPayload.p_id_recibos = input.p_id_recibos;
      }

      const { data, error } = await supabase.rpc("enviar_remesa_bloque", rpcPayload);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: tenantListKey("recibos", rol, tenantId) });
    },
  });

  return { list, create, update, remove, generarRemesaMensual, enviarRemesaBloque };
}
