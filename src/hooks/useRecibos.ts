import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  appendIdInFilter,
  centerFilterQueryKey,
  fetchAlumnoIdsForCenter,
} from "@/lib/centroFilter";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";
import { compareAlphabetic, MESES_ANIO } from "@/lib/alumnosMatriculasUtils";
import { calcVentaLineaSubtotal, invokeGenerarPdfBorradorRecibo } from "@/hooks/useVentasLineas";
import { normalizeMetodoPago } from "@/lib/alumnoPaymentUtils";

export const RECIBOS_PAGE_SIZE = 25;

export type VentaLineaDraftInput = {
  CONCEPTO: string;
  CANTIDAD: number;
  PRECIO_UNITARIO: number;
  IVA_PORCENTAJE: number;
};

export type CreateReciboBorradorInput = {
  ID_CENTRO: string;
  ID_CURSO?: string | null;
  ID_ALUMNO?: string | null;
  RECEPTOR_NOMBRE: string;
  CIF_DNI: string;
  DIRECCION?: string | null;
  MAIL?: string | null;
  TLF?: string | null;
  FECHA?: string | null;
  MES_PERIODO?: string | null;
  METODO_PAGO: string;
  TIPO_DOC?: string;
  lineas: VentaLineaDraftInput[];
};

function generarIdRecibo(): string {
  return `rec_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function generarIdLinea(): string {
  return `LIN_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

/** Previsualiza la REF que asignará el trigger generar_ref_recibo al insertar. */
export async function previewNextRefRecibo(
  idCliente: string,
  idCentro: string,
): Promise<string> {
  const scopedCliente = idCliente.trim();
  const scopedCentro = idCentro.trim();
  if (!scopedCliente || !scopedCentro) {
    throw new Error("Faltan cliente o centro para previsualizar la referencia.");
  }

  const { data: centro, error: centroErr } = await supabase
    .from("CENTROS")
    .select("REF_FACTURA")
    .eq("ID_CENTRO", scopedCentro)
    .maybeSingle();
  if (centroErr) throw centroErr;

  const refFactura = centro?.REF_FACTURA?.trim();
  const prefix = refFactura || scopedCliente;

  const { data: refs, error: refsErr } = await supabase
    .from("RECIBOS_MENSUALES")
    .select("REF_RECIBO")
    .eq("ID_CLIENTE", scopedCliente)
    .eq("ID_CENTRO", scopedCentro);
  if (refsErr) throw refsErr;

  let maxNum = 0;
  for (const row of refs ?? []) {
    const match = row.REF_RECIBO?.match(/-(\d+)$/);
    if (match) {
      maxNum = Math.max(maxNum, Number.parseInt(match[1], 10));
    }
  }

  const siguiente = maxNum + 1;
  return `${prefix}-${String(siguiente).padStart(4, "0")}`;
}

export async function createReciboBorradorConLineas(
  tenantId: string,
  input: CreateReciboBorradorInput,
): Promise<{ idRecibo: string; refRecibo: string; pdfError: string | null }> {
  const idCentro = input.ID_CENTRO.trim();
  if (!idCentro) {
    throw new Error("El centro es obligatorio para crear la factura.");
  }
  if (input.lineas.length === 0) {
    throw new Error("Añade al menos una línea de venta.");
  }

  const idRecibo = generarIdRecibo();
  const { data: recibo, error: reciboErr } = await supabase
    .from("RECIBOS_MENSUALES")
    .insert({
      ID_RECIBO: idRecibo,
      ID_CLIENTE: tenantId,
      ID_CENTRO: idCentro,
      ID_CURSO: input.ID_CURSO?.trim() || null,
      ID_ALUMNO: input.ID_ALUMNO?.trim() || null,
      RECEPTOR_NOMBRE: input.RECEPTOR_NOMBRE.trim(),
      CIF_DNI: input.CIF_DNI.trim(),
      DIRECCION: input.DIRECCION?.trim() || null,
      MAIL: input.MAIL?.trim() || null,
      TLF: input.TLF?.trim() || null,
      FECHA: input.FECHA?.trim() || new Date().toISOString().slice(0, 10),
      MES_PERIODO: input.MES_PERIODO?.trim() || null,
      TIPO_DOC: input.TIPO_DOC?.trim() || "Recibo",
      METODO_PAGO: normalizeMetodoPago(input.METODO_PAGO) || input.METODO_PAGO.trim(),
      ESTADO_PAGO: "Borrador",
    })
    .select("ID_RECIBO, REF_RECIBO")
    .single();
  if (reciboErr) throw reciboErr;

  const lineasPayload = input.lineas.map((linea) => {
    const cantidad = Number(linea.CANTIDAD);
    const precio = Number(linea.PRECIO_UNITARIO);
    const iva = Number(linea.IVA_PORCENTAJE);
    return {
      ID_LINEA: generarIdLinea(),
      ID_CLIENTE: tenantId,
      ID_RECIBO: idRecibo,
      CONCEPTO: linea.CONCEPTO.trim(),
      CANTIDAD: cantidad,
      PRECIO_UNITARIO: precio,
      DESCUENTO_LINEA: 0,
      IVA_PORCENTAJE: iva,
      SUBTOTAL: calcVentaLineaSubtotal(cantidad, precio, iva),
    };
  });

  const { error: lineasErr } = await supabase.from("VENTAS_LINEAS").insert(lineasPayload);
  if (lineasErr) throw lineasErr;

  const { error: rpcErr } = await supabase.rpc("recalcular_recibo_desde_lineas", {
    p_id_recibo: idRecibo,
  });
  if (rpcErr) throw rpcErr;

  let pdfError: string | null = null;
  try {
    await invokeGenerarPdfBorradorRecibo(idRecibo);
  } catch (err) {
    pdfError = err instanceof Error ? err.message : "No se pudo generar el PDF borrador.";
  }

  return {
    idRecibo,
    refRecibo: (recibo as { REF_RECIBO?: string }).REF_RECIBO?.trim() || idRecibo,
    pdfError,
  };
}

export const ESTADO_PAGO_OPTIONS = ["Cobrado", "Borrador", "Anulado"] as const;
export type EstadoPagoOption = (typeof ESTADO_PAGO_OPTIONS)[number];

export type RecibosListFilters = {
  centerId?: string | null;
  cursoId?: string | null;
  mesPeriodo?: string | null;
  alumnoId?: string | null;
};

export type ReciboRow = {
  ID_RECIBO: string;
  ID_CLIENTE: string;
  REF_RECIBO: string;
  ID_ALUMNO: string;
  ID_CENTRO?: string | null;
  ID_CURSO?: string | null;
  MAIL: string | null;
  TLF: string | null;
  FECHA: string | null;
  MES_PERIODO: string | null;
  RECEPTOR_NOMBRE: string | null;
  CIF_DNI: string | null;
  DIRECCION: string | null;
  TIPO_DOC: string | null;
  METODO_PAGO: string | null;
  TOTAL_BASE: number | null;
  DESCUENTO: number | null;
  TOTAL_IVA: number | null;
  TOTAL_DOC: number | null;
  NUM_FACTURA_KOREFACTU: string | null;
  LINK_FACTURA_KOREFACTU: string | null;
  HUELLA_HASH: string | null;
  URL_QR: string | null;
  LINK_PDF_RECIBO: string | null;
  LINK_PDF_BORRADOR: string | null;
  ESTADO_PAGO: string | null;
  ALUMNOS: { NOMBRE_ALUMNO: string } | null;
};

function normalizeMesNombre(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function mesPeriodoSortKey(mesPeriodo: string | null | undefined): number {
  if (!mesPeriodo?.trim()) return -1;

  const match = mesPeriodo.trim().match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s+(\d{4})$/);
  if (!match) return -1;

  const monthIdx = MESES_ANIO.findIndex(
    (mes) => normalizeMesNombre(mes) === normalizeMesNombre(match[1]),
  );
  if (monthIdx < 0) return -1;

  return Number(match[2]) * 100 + monthIdx;
}

export function reciboAlumnoNombre(recibo: Pick<ReciboRow, "ALUMNOS" | "RECEPTOR_NOMBRE">): string {
  return recibo.ALUMNOS?.NOMBRE_ALUMNO?.trim() || recibo.RECEPTOR_NOMBRE?.trim() || "";
}

export function sortRecibosByPeriodoAndAlumno(rows: ReciboRow[]): ReciboRow[] {
  return [...rows].sort((a, b) => {
    const periodDiff = mesPeriodoSortKey(b.MES_PERIODO) - mesPeriodoSortKey(a.MES_PERIODO);
    if (periodDiff !== 0) return periodDiff;
    return compareAlphabetic(reciboAlumnoNombre(a), reciboAlumnoNombre(b));
  });
}

async function attachAlumnosToRecibos(
  recibos: Record<string, unknown>[],
  tenantId: string,
  rol: string | null | undefined,
  alumnoIds: string[] | null,
): Promise<ReciboRow[]> {
  if (recibos.length === 0) return [];

  let alumnosQuery = supabase.from("ALUMNOS").select("ID_ALUMNO, NOMBRE_ALUMNO");
  alumnosQuery = scopeTenantQuery(alumnosQuery, rol, tenantId);
  if (alumnoIds) {
    alumnosQuery = alumnosQuery.in("ID_ALUMNO", alumnoIds);
  }
  const { data: alumnos, error } = await alumnosQuery;
  if (error) throw error;

  return recibos.map((row) => {
    const aluFound = alumnos?.find((a) => a.ID_ALUMNO === row.ID_ALUMNO);
    return {
      ...(row as Omit<ReciboRow, "ALUMNOS">),
      ALUMNOS: aluFound ? { NOMBRE_ALUMNO: aluFound.NOMBRE_ALUMNO } : null,
    };
  });
}

function buildRecibosQueryKey(
  rol: string | null | undefined,
  tenantId: string,
  filters: RecibosListFilters,
) {
  return [
    ...tenantListKey("recibos", rol, tenantId),
    centerFilterQueryKey(filters.centerId),
    filters.cursoId?.trim() || "all-cursos",
    filters.mesPeriodo?.trim() || "all-meses",
    filters.alumnoId?.trim() || "all-alumnos",
  ] as const;
}

export function useRecibos(filters: RecibosListFilters = {}) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = buildRecibosQueryKey(rol, tenantId, filters);

  const list = useInfiniteQuery({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const filterCenterId = filters.centerId;
      const alumnoIds = await fetchAlumnoIdsForCenter(tenantId, rol, filterCenterId);
      if (alumnoIds && alumnoIds.length === 0) return [];

      let query = supabase.from("RECIBOS_MENSUALES").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      let scoped = appendIdInFilter(query, "ID_ALUMNO", alumnoIds);
      if (scoped === "empty") return [];

      const cursoId = filters.cursoId?.trim();
      if (cursoId) {
        scoped = scoped.eq("ID_CURSO", cursoId);
      }

      const mesPeriodo = filters.mesPeriodo?.trim();
      if (mesPeriodo) {
        scoped = scoped.eq("MES_PERIODO", mesPeriodo);
      }

      const alumnoId = filters.alumnoId?.trim();
      if (alumnoId) {
        scoped = scoped.eq("ID_ALUMNO", alumnoId);
      }

      const from = pageParam * RECIBOS_PAGE_SIZE;
      const to = from + RECIBOS_PAGE_SIZE - 1;

      const { data: recibos, error } = await scoped
        .order("FECHA", { ascending: false })
        .range(from, to);

      if (error) throw error;

      return attachAlumnosToRecibos(recibos ?? [], tenantId, rol, alumnoIds);
    },
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (lastPage.length < RECIBOS_PAGE_SIZE) return undefined;
      return lastPageParam + 1;
    },
  });

  const mesPeriodoOptions = useQuery({
    queryKey: [...tenantListKey("recibos-meses", rol, tenantId)],
    queryFn: async () => {
      let query = supabase.from("RECIBOS_MENSUALES").select("MES_PERIODO");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query;
      if (error) throw error;

      const unique = [
        ...new Set(
          (data ?? [])
            .map((row) => row.MES_PERIODO?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ];

      return unique.sort((a, b) => b.localeCompare(a, "es", { sensitivity: "base" }));
    },
  });

  const create = useMutation({
    mutationFn: async (input: CreateReciboBorradorInput) => {
      return createReciboBorradorConLineas(tenantId, input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: [...tenantListKey("recibos-meses", rol, tenantId)] });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { data, error } = await supabase
        .from("RECIBOS_MENSUALES")
        .update(patch)
        .eq("ID_RECIBO", id)
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
        .from("RECIBOS_MENSUALES")
        .delete()
        .eq("ID_RECIBO", id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, mesPeriodoOptions, create, update, remove };
}

export const VERIFACTU_RECIBO_NO_DISPONIBLE_TOAST =
  "VERIFACTU NO DISPONIBLE, EL RECIBO SE HA MARCADO COMO COBRADO PERO LA FACTURA NO SE HA EMITIDO CON VERIFACTU.";

export function isVerifactuReciboEmitAvailable(): boolean {
  return true;
}

export type CobradoVerifactuEmisionResult = {
  linkPdfRecibo: string | null;
  notification: "none" | "unavailable" | "success" | "pdf_missing";
  NUM_FACTURA_KOREFACTU?: string | null;
  LINK_FACTURA_KOREFACTU?: string | null;
  URL_QR?: string | null;
  HUELLA_HASH?: string | null;
  excelError?: string | null;
};

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

export const VERIFACTU_EMITIDA_SIN_PDF_TOAST =
  "Factura emitida en Korefactu, pero no se pudo descargar el PDF oficial. El recibo queda Cobrado con número y QR.";

export const KOREFACTU_PDF_NO_DISPONIBLE_TOAST =
  "Korefactu no permite descargar el PDF en este momento. La factura sigue registrada.";

export function reciboTieneFacturaOficial(
  row: Pick<ReciboRow, "LINK_FACTURA_KOREFACTU" | "LINK_PDF_RECIBO">,
): boolean {
  return Boolean(row.LINK_FACTURA_KOREFACTU?.trim());
}

export async function resolveDescargarPdfFacturaKorefactu(
  reciboId: string,
): Promise<{ linkPdfRecibo: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Tu sesión ha caducado. Cierra sesión y vuelve a entrar.");
  }

  const { data, error } = await supabase.functions.invoke("korefactu-emitir-factura", {
    body: { id_recibo: reciboId, solo_descargar_pdf: true },
  });

  const payload = data as { error?: string; link?: string | null } | null;
  if (payload?.error?.trim()) {
    throw new Error(payload.error.trim());
  }
  if (error) {
    const fromBody = await readFunctionsInvokeError(error);
    throw new Error(fromBody || KOREFACTU_PDF_NO_DISPONIBLE_TOAST);
  }

  const link = payload?.link?.trim();
  if (!link) {
    throw new Error(KOREFACTU_PDF_NO_DISPONIBLE_TOAST);
  }

  return { linkPdfRecibo: link };
}

export async function resolveCobradoVerifactuEmision(
  reciboId: string,
  _refRecibo: string | null | undefined,
): Promise<CobradoVerifactuEmisionResult> {
  if (!isVerifactuReciboEmitAvailable()) {
    return { linkPdfRecibo: null, notification: "unavailable" };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Tu sesión ha caducado. Cierra sesión y vuelve a entrar.");
  }

  const { data, error } = await supabase.functions.invoke("korefactu-emitir-factura", {
    body: { id_recibo: reciboId },
  });

  const payload = data as
    | {
        error?: string;
        link?: string | null;
        pdfDownloaded?: boolean;
        notification?: "success" | "pdf_missing";
        NUM_FACTURA_KOREFACTU?: string | null;
        LINK_FACTURA_KOREFACTU?: string | null;
        URL_QR?: string | null;
        HUELLA_HASH?: string | null;
        excel_error?: string | null;
      }
    | null;

  if (payload?.error?.trim()) {
    throw new Error(payload.error.trim());
  }
  if (error) {
    const fromBody = await readFunctionsInvokeError(error);
    if (fromBody) throw new Error(fromBody);
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status === 401) {
      throw new Error("No autorizado para emitir la factura.");
    }
    throw new Error(error instanceof Error ? error.message : "Error al emitir la factura con Korefactu.");
  }

  const link = payload?.link?.trim() || null;
  const hasEmission = payload?.LINK_FACTURA_KOREFACTU?.trim() || null;
  if (!hasEmission) {
    throw new Error("Korefactu no emitió la factura. El recibo sigue en Borrador.");
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

export function buildReciboCobradoPatch(
  verifactu: CobradoVerifactuEmisionResult,
  extraPatch?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...extraPatch,
    ESTADO_PAGO: "Cobrado",
    LINK_PDF_RECIBO: verifactu.linkPdfRecibo,
    NUM_FACTURA_KOREFACTU: verifactu.NUM_FACTURA_KOREFACTU ?? null,
    LINK_FACTURA_KOREFACTU: verifactu.LINK_FACTURA_KOREFACTU ?? null,
    URL_QR: verifactu.URL_QR ?? null,
    HUELLA_HASH: verifactu.HUELLA_HASH ?? null,
  };
}

export const VERIFACTU_ANULACION_NO_DISPONIBLE_TOAST =
  "VERIFACTU NO DISPONIBLE, EL RECIBO SE HA MARCADO COMO ANULADO EN LA APP PERO LA ANULACIÓN NO SE HA ENVIADO A VERIFACTU.";

export function isVerifactuAnulacionAvailable(): boolean {
  return true;
}

export function reciboRequiereAnulacionKorefactu(
  row: Pick<ReciboRow, "ESTADO_PAGO" | "LINK_FACTURA_KOREFACTU">,
): boolean {
  const estado = normalizeEstadoPago(row.ESTADO_PAGO);
  if (estado !== "Cobrado" && estado !== "Anulado") return false;
  return Boolean(row.LINK_FACTURA_KOREFACTU?.trim());
}

export type AnulacionVerifactuResult = {
  notification: "success";
  linkPdfRecibo: string | null;
  uuidAnulado?: string | null;
  orphan?: boolean;
};

export async function resolveAnulacionVerifactu(
  reciboId: string,
  uuid?: string | null,
): Promise<AnulacionVerifactuResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Tu sesión ha caducado. Cierra sesión y vuelve a entrar.");
  }

  const invokeBody: { id_recibo: string; uuid?: string } = { id_recibo: reciboId };
  const trimmedUuid = uuid?.trim();
  if (trimmedUuid) {
    invokeBody.uuid = trimmedUuid;
  }

  const { data, error } = await supabase.functions.invoke("korefactu-anular-factura", {
    body: invokeBody,
  });

  const payload = data as
    | {
        error?: string;
        link?: string | null;
        notification?: string;
        uuidAnulado?: string | null;
        orphan?: boolean;
      }
    | null;
  if (payload?.error?.trim()) {
    throw new Error(payload.error.trim());
  }
  if (error) {
    const fromBody = await readFunctionsInvokeError(error);
    if (fromBody) throw new Error(fromBody);
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status === 401) {
      throw new Error("No autorizado para anular la factura.");
    }
    throw new Error(error instanceof Error ? error.message : "Error al anular la factura en Korefactu.");
  }

  return {
    notification: "success",
    linkPdfRecibo: payload?.link?.trim() || null,
    uuidAnulado: payload?.uuidAnulado?.trim() || trimmedUuid || null,
    orphan: payload?.orphan === true,
  };
}

export function normalizeEstadoPago(estado: string | null | undefined): EstadoPagoOption {
  const value = estado?.trim().toLowerCase();
  if (value === "cobrado" || value === "pagado") return "Cobrado";
  if (value === "anulado") return "Anulado";
  return "Borrador";
}

export function isEstadoPagoLocked(estado: EstadoPagoOption): boolean {
  return estado === "Anulado";
}

export function getEstadoPagoSelectableOptions(current: EstadoPagoOption): EstadoPagoOption[] {
  switch (current) {
    case "Anulado":
      return ["Anulado"];
    case "Cobrado":
      return ["Cobrado", "Anulado"];
    case "Borrador":
    default:
      return [...ESTADO_PAGO_OPTIONS];
  }
}

export function canTransitionEstadoPago(
  current: EstadoPagoOption,
  next: EstadoPagoOption,
): boolean {
  return getEstadoPagoSelectableOptions(current).includes(next);
}

export function estadoPagoSelectClass(estado: EstadoPagoOption): string {
  switch (estado) {
    case "Cobrado":
      return "bg-emerald-100 text-emerald-900 border-emerald-200 hover:bg-emerald-100/90 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-900/50 dark:hover:bg-emerald-900/40";
    case "Borrador":
      return "bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-100/90 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900/50 dark:hover:bg-amber-900/40";
    case "Anulado":
      return "bg-red-100 text-red-900 border-red-200 hover:bg-red-100/90 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900/50 dark:hover:bg-red-900/40";
  }
}

export function estadoPagoStatus(estado: EstadoPagoOption): "success" | "pending" | "destructive" {
  switch (estado) {
    case "Cobrado":
      return "success";
    case "Borrador":
      return "pending";
    case "Anulado":
      return "destructive";
  }
}
