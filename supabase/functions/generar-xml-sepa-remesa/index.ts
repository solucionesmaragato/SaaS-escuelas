import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@^2";

interface RequestBody {
  id_cliente?: string;
  id_centro?: string;
  id_curso?: string;
  mes_periodo?: string;
  id_recibos_incluidos?: string[];
}

interface RemesaMetaRow {
  ID_REMESA: string;
  LINK_XML_SEPA: string | null;
}

interface ClienteRow {
  NOMBRE_ESCUELA: string | null;
  CIF: string | null;
  IBAN: string | null;
  IDENTIFICADOR_ACREEDOR: string | null;
}

interface ReciboSepaRow {
  ID_RECIBO: string;
  REF_RECIBO: string;
  ID_ALUMNO: string;
  RECEPTOR_NOMBRE: string | null;
  TOTAL_DOC: number | null;
  METODO_PAGO: string | null;
  ESTADO_PAGO: string | null;
  ALUMNOS:
    | {
        NOMBRE_ALUMNO: string | null;
        IBAN: string | null;
        TITULAR_CUENTA: string | null;
      }
    | {
        NOMBRE_ALUMNO: string | null;
        IBAN: string | null;
        TITULAR_CUENTA: string | null;
      }[]
    | null;
}

interface MandatoRow {
  ID_MANDATO: string;
  TOKEN_PUBLICO: string | null;
  FIRMADO_AT: string | null;
  ESTADO: string | null;
}

type SeqTp = "FRST" | "RCUR";

interface PreparedSepaRecibo {
  recibo: ReciboSepaRow;
  alumnoLabel: string;
  debtorIban: string;
  debtorName: string;
  mandateId: string;
  mandateSignedDate: string;
  amount: number;
  seqTp: SeqTp;
}

interface SepaTransaction {
  seqTp: SeqTp;
  instrId: string;
  endToEndId: string;
  amount: number;
  debtorName: string;
  debtorIban: string;
  mandateId: string;
  mandateSignedDate: string;
  remittanceInfo: string;
  alumnoLabel: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DOCUMENTOS_BUCKET = "documentos-legales";
const PAIN_NS = "urn:iso:std:iso:20022:tech:xsd:pain.008.001.02";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function latinizeSepaText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function sanitizeSepaId(value: string, maxLen = 35): string {
  const sanitized = latinizeSepaText(value)
    .trim()
    .replace(/[^A-Za-z0-9+\-/?:().,' ]/g, "")
    .slice(0, maxLen);
  return sanitized || "REF";
}

function formatAmount(value: number): string {
  return Number(value).toFixed(2);
}

function isSepaMetodoPago(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const m = value.trim().toLowerCase();
  if (m === "efectivo" || m === "cash") return false;
  if (m === "tarjeta" || m === "card" || m === "tpv" || m.includes("stripe")) return false;
  if (m === "bizum") return false;
  if (m === "transferencia" || m === "transfer") return false;
  return true;
}

function isReciboBorrador(estado: string | null | undefined): boolean {
  return estado?.trim().toLowerCase() === "borrador";
}

function resolveAlumno(row: ReciboSepaRow) {
  const alumnos = row.ALUMNOS;
  if (Array.isArray(alumnos)) return alumnos[0] ?? null;
  return alumnos ?? null;
}

function resolveAlumnoLabel(row: ReciboSepaRow): string {
  const alumno = resolveAlumno(row);
  return alumno?.NOMBRE_ALUMNO?.trim() || row.RECEPTOR_NOMBRE?.trim() || "Sin nombre";
}

function resolveDebtorName(row: ReciboSepaRow): string {
  const alumno = resolveAlumno(row);
  const raw =
    alumno?.TITULAR_CUENTA?.trim() ||
    row.RECEPTOR_NOMBRE?.trim() ||
    alumno?.NOMBRE_ALUMNO?.trim() ||
    "Deudor";
  return latinizeSepaText(raw);
}

function normalizeSepaIbanOrId(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function resolveDebtorIban(row: ReciboSepaRow): string {
  return normalizeSepaIbanOrId(resolveAlumno(row)?.IBAN);
}

function toIsoDate(value: string): string {
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Fecha de mandato invalida: ${value}`);
  return parsed.toISOString().slice(0, 10);
}

function addDaysIsoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function extractStoragePathFromPublicUrl(publicUrl: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length).split("?")[0] ?? "");
}

async function fetchSignedMandato(
  supabase: SupabaseClient,
  idAlumno: string,
): Promise<MandatoRow | null> {
  const { data, error } = await supabase
    .from("MANDATOS_SEPA")
    .select("ID_MANDATO, TOKEN_PUBLICO, FIRMADO_AT, ESTADO")
    .eq("ID_ALUMNO", idAlumno)
    .ilike("ESTADO", "firmado")
    .not("FIRMADO_AT", "is", null)
    .order("FIRMADO_AT", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as MandatoRow | null) ?? null;
}

async function hasPriorSepaCobrado(
  supabase: SupabaseClient,
  idCliente: string,
  idAlumno: string,
  excludeReciboId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("RECIBOS_MENSUALES")
    .select("ID_RECIBO, METODO_PAGO")
    .eq("ID_CLIENTE", idCliente)
    .eq("ID_ALUMNO", idAlumno)
    .eq("ESTADO_PAGO", "Cobrado")
    .neq("ID_RECIBO", excludeReciboId);

  if (error) throw error;
  return (data ?? []).some((row) => isSepaMetodoPago((row as { METODO_PAGO?: string | null }).METODO_PAGO));
}

function buildGroupedRemittanceInfo(
  nombreEscuela: string,
  alumnoNames: string[],
  mesPeriodo: string,
): string {
  const uniqueNames = [
    ...new Set(alumnoNames.map((name) => name.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  const text = `${nombreEscuela.trim()} - Alumnos: ${uniqueNames.join(", ")} - ${mesPeriodo.trim()}`;
  return sanitizeSepaId(text, 140);
}

function groupKeyForSepaRecibo(debtorIban: string, mandateId: string): string {
  return `${debtorIban}|${mandateId}`;
}

function buildGroupedSepaTransactions(
  prepared: PreparedSepaRecibo[],
  nombreEscuela: string,
  mesPeriodo: string,
  remesaId: string,
): SepaTransaction[] {
  const groups = new Map<string, PreparedSepaRecibo[]>();

  for (const item of prepared) {
    const key = groupKeyForSepaRecibo(item.debtorIban, item.mandateId);
    const prev = groups.get(key) ?? [];
    prev.push(item);
    groups.set(key, prev);
  }

  const transactions: SepaTransaction[] = [];

  for (const [groupKey, items] of groups) {
    const amount = items.reduce((sum, item) => sum + item.amount, 0);
    if (amount <= 0) {
      throw new Error(`Importe invalido en adeudo agrupado (${groupKey}).`);
    }

    const seqTp: SeqTp = items.every((item) => item.seqTp === "RCUR") ? "RCUR" : "FRST";
    const first = items[0];
    const reciboIds = items.map((item) => item.recibo.ID_RECIBO);

    transactions.push({
      seqTp,
      instrId: sanitizeSepaId(reciboIds.join("-"), 35),
      endToEndId: sanitizeSepaId(`${remesaId}-${groupKey}`, 35),
      amount: Math.round(amount * 100) / 100,
      debtorName: first.debtorName,
      debtorIban: first.debtorIban,
      mandateId: first.mandateId,
      mandateSignedDate: first.mandateSignedDate,
      remittanceInfo: buildGroupedRemittanceInfo(
        nombreEscuela,
        items.map((item) => item.alumnoLabel),
        mesPeriodo,
      ),
      alumnoLabel: items.map((item) => item.alumnoLabel).join(", "),
    });
  }

  return transactions.sort((a, b) =>
    a.debtorIban.localeCompare(b.debtorIban, "es", { sensitivity: "base" }),
  );
}

function buildFinInstnIdNotProvided(): string {
  return `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;
}

function buildDrctDbtTxInf(tx: SepaTransaction): string {
  return [
    "<DrctDbtTxInf>",
    "<PmtId>",
    `<InstrId>${escapeXml(tx.instrId)}</InstrId>`,
    `<EndToEndId>${escapeXml(tx.endToEndId)}</EndToEndId>`,
    "</PmtId>",
    `<InstdAmt Ccy="EUR">${formatAmount(tx.amount)}</InstdAmt>`,
    "<DrctDbtTx>",
    "<MndtRltdInf>",
    `<MndtId>${escapeXml(tx.mandateId)}</MndtId>`,
    `<DtOfSgntr>${escapeXml(tx.mandateSignedDate)}</DtOfSgntr>`,
    "</MndtRltdInf>",
    "</DrctDbtTx>",
    `<DbtrAgt>${buildFinInstnIdNotProvided()}</DbtrAgt>`,
    "<Dbtr>",
    `<Nm>${escapeXml(tx.debtorName)}</Nm>`,
    "</Dbtr>",
    "<DbtrAcct>",
    "<Id>",
    `<IBAN>${escapeXml(tx.debtorIban)}</IBAN>`,
    "</Id>",
    "</DbtrAcct>",
    "<RmtInf>",
    `<Ustrd>${escapeXml(tx.remittanceInfo)}</Ustrd>`,
    "</RmtInf>",
    "</DrctDbtTxInf>",
  ].join("");
}

function buildPmtInf(params: {
  pmtInfId: string;
  seqTp: SeqTp;
  transactions: SepaTransaction[];
  collectionDate: string;
  creditorName: string;
  creditorIban: string;
  creditorSchemeId: string;
}): string {
  const nbOfTxs = params.transactions.length;
  const ctrlSum = params.transactions.reduce((sum, tx) => sum + tx.amount, 0);

  return [
    "<PmtInf>",
    `<PmtInfId>${escapeXml(params.pmtInfId)}</PmtInfId>`,
    "<PmtMtd>DD</PmtMtd>",
    `<NbOfTxs>${nbOfTxs}</NbOfTxs>`,
    `<CtrlSum>${formatAmount(ctrlSum)}</CtrlSum>`,
    "<PmtTpInf>",
    "<SvcLvl><Cd>SEPA</Cd></SvcLvl>",
    "<LclInstrm><Cd>CORE</Cd></LclInstrm>",
    `<SeqTp>${params.seqTp}</SeqTp>`,
    "</PmtTpInf>",
    `<ReqdColltnDt>${escapeXml(params.collectionDate)}</ReqdColltnDt>`,
    "<Cdtr>",
    `<Nm>${escapeXml(params.creditorName)}</Nm>`,
    "</Cdtr>",
    "<CdtrAcct>",
    "<Id>",
    `<IBAN>${escapeXml(params.creditorIban)}</IBAN>`,
    "</Id>",
    "</CdtrAcct>",
    `<CdtrAgt>${buildFinInstnIdNotProvided()}</CdtrAgt>`,
    "<CdtrSchmeId>",
    "<Id>",
    "<PrvtId>",
    "<Othr>",
    `<Id>${escapeXml(params.creditorSchemeId)}</Id>`,
    "<SchmeNm><Prtry>SEPA</Prtry></SchmeNm>",
    "</Othr>",
    "</PrvtId>",
    "</Id>",
    "</CdtrSchmeId>",
    ...params.transactions.map(buildDrctDbtTxInf),
    "</PmtInf>",
  ].join("");
}

function buildPain008Document(params: {
  msgId: string;
  creationDateTime: string;
  initiatingPartyName: string;
  collectionDate: string;
  creditorName: string;
  creditorIban: string;
  creditorSchemeId: string;
  remesaId: string;
  transactions: SepaTransaction[];
}): string {
  const frstTx = params.transactions.filter((tx) => tx.seqTp === "FRST");
  const rcurTx = params.transactions.filter((tx) => tx.seqTp === "RCUR");
  const allTx = [...frstTx, ...rcurTx];
  const nbOfTxs = allTx.length;
  const ctrlSum = allTx.reduce((sum, tx) => sum + tx.amount, 0);

  const pmtInfBlocks: string[] = [];
  if (frstTx.length > 0) {
    pmtInfBlocks.push(
      buildPmtInf({
        pmtInfId: `${params.remesaId}-FRST`,
        seqTp: "FRST",
        transactions: frstTx,
        collectionDate: params.collectionDate,
        creditorName: params.creditorName,
        creditorIban: params.creditorIban,
        creditorSchemeId: params.creditorSchemeId,
      }),
    );
  }
  if (rcurTx.length > 0) {
    pmtInfBlocks.push(
      buildPmtInf({
        pmtInfId: `${params.remesaId}-RCUR`,
        seqTp: "RCUR",
        transactions: rcurTx,
        collectionDate: params.collectionDate,
        creditorName: params.creditorName,
        creditorIban: params.creditorIban,
        creditorSchemeId: params.creditorSchemeId,
      }),
    );
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Document xmlns="${PAIN_NS}">`,
    "<CstmrDrctDbtInitn>",
    "<GrpHdr>",
    `<MsgId>${escapeXml(params.msgId)}</MsgId>`,
    `<CreDtTm>${escapeXml(params.creationDateTime)}</CreDtTm>`,
    `<NbOfTxs>${nbOfTxs}</NbOfTxs>`,
    `<CtrlSum>${formatAmount(ctrlSum)}</CtrlSum>`,
    "<InitgPty>",
    `<Nm>${escapeXml(params.initiatingPartyName)}</Nm>`,
    "</InitgPty>",
    "</GrpHdr>",
    ...pmtInfBlocks,
    "</CstmrDrctDbtInitn>",
    "</Document>",
  ].join("");
}

async function uploadSepaXml(
  supabase: SupabaseClient,
  idCliente: string,
  idRemesa: string,
  xmlBytes: Uint8Array,
  previousLink: string | null | undefined,
): Promise<string> {
  const timestamp = Date.now();
  const storagePath = `${idCliente}/remesas/${idRemesa}_sepa_${timestamp}.xml`;
  const { error: uploadErr } = await supabase.storage.from(DOCUMENTOS_BUCKET).upload(storagePath, xmlBytes, {
    contentType: "application/xml",
    upsert: false,
  });
  if (uploadErr) {
    throw new Error(`Error al subir XML SEPA: ${uploadErr.message}`);
  }

  if (previousLink?.trim()) {
    const oldPath = extractStoragePathFromPublicUrl(previousLink.trim(), DOCUMENTOS_BUCKET);
    if (oldPath?.startsWith(`${idCliente}/remesas/`)) {
      await supabase.storage.from(DOCUMENTOS_BUCKET).remove([oldPath]);
    }
  }

  const { data: urlData } = supabase.storage.from(DOCUMENTOS_BUCKET).getPublicUrl(storagePath);
  if (!urlData.publicUrl) {
    throw new Error("No se pudo obtener la URL publica del XML SEPA.");
  }
  return `${urlData.publicUrl}?v=${timestamp}`;
}

export default {
  fetch: withSupabase({ auth: ["user"] }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const body = (await req.json()) as RequestBody;
      const idCliente = body.id_cliente?.trim();
      const idCentro = body.id_centro?.trim();
      const idCurso = body.id_curso?.trim();
      const mesPeriodo = body.mes_periodo?.trim();

      if (!idCliente || !idCentro || !idCurso || !mesPeriodo) {
        return new Response(JSON.stringify({ error: "Faltan id_cliente, id_centro, id_curso o mes_periodo." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const { error: scopeErr } = await ctx.supabase.rpc("assert_remesa_excel_scope", {
        p_id_cliente: idCliente,
        p_id_centro: idCentro,
      });
      if (scopeErr) {
        return new Response(JSON.stringify({ error: scopeErr.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      const { data: remesaMeta, error: remesaErr } = await ctx.supabase.rpc("get_remesa_excel_meta", {
        p_id_cliente: idCliente,
        p_id_centro: idCentro,
        p_id_curso: idCurso,
        p_mes_periodo: mesPeriodo,
      });
      if (remesaErr) throw remesaErr;

      const remesaRow = (Array.isArray(remesaMeta) ? remesaMeta[0] : remesaMeta) as
        | { ID_REMESA?: string }
        | undefined;
      if (!remesaRow?.ID_REMESA) {
        return new Response(JSON.stringify({ error: "No se encontro CONTROL_REMESAS para ese lote." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      const { data: remesaLinkRow, error: remesaLinkErr } = await ctx.supabase
        .from("CONTROL_REMESAS")
        .select("LINK_XML_SEPA")
        .eq("ID_REMESA", remesaRow.ID_REMESA)
        .maybeSingle();
      if (remesaLinkErr) throw remesaLinkErr;

      const remesa: RemesaMetaRow = {
        ID_REMESA: remesaRow.ID_REMESA,
        LINK_XML_SEPA: (remesaLinkRow as { LINK_XML_SEPA?: string | null } | null)?.LINK_XML_SEPA ?? null,
      };

      if (!remesa.ID_REMESA) {
        return new Response(JSON.stringify({ error: "No se encontro CONTROL_REMESAS para ese lote." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      const { data: cliente, error: clienteErr } = await ctx.supabase
        .from("CLIENTES")
        .select("NOMBRE_ESCUELA, CIF, IBAN, IDENTIFICADOR_ACREEDOR")
        .eq("ID_CLIENTE", idCliente)
        .maybeSingle();
      if (clienteErr) throw clienteErr;
      if (!cliente) {
        throw new Error("No se encontro el emisor (CLIENTES) de la remesa.");
      }

      const clienteRow = cliente as ClienteRow;
      const creditorName = clienteRow.NOMBRE_ESCUELA?.trim();
      const creditorIban = normalizeSepaIbanOrId(clienteRow.IBAN);
      const creditorSchemeId = normalizeSepaIbanOrId(clienteRow.IDENTIFICADOR_ACREEDOR);

      if (!creditorName) {
        throw new Error("Falta NOMBRE_ESCUELA del acreedor en CLIENTES.");
      }
      if (!creditorIban) {
        throw new Error("Falta IBAN del acreedor en CLIENTES. Configuralo antes de enviar la remesa.");
      }
      if (!creditorSchemeId) {
        throw new Error(
          "Falta IDENTIFICADOR_ACREEDOR en CLIENTES. Configuralo antes de enviar la remesa.",
        );
      }

      const { data: recibos, error: recibosErr } = await ctx.supabase
        .from("RECIBOS_MENSUALES")
        .select(
          "ID_RECIBO, REF_RECIBO, ID_ALUMNO, RECEPTOR_NOMBRE, TOTAL_DOC, METODO_PAGO, ESTADO_PAGO, ALUMNOS(NOMBRE_ALUMNO, IBAN, TITULAR_CUENTA)",
        )
        .eq("ID_CLIENTE", idCliente)
        .eq("ID_CENTRO", idCentro)
        .eq("ID_CURSO", idCurso)
        .eq("MES_PERIODO", mesPeriodo);
      if (recibosErr) throw recibosErr;

      const sepaRecibos = ((recibos ?? []) as ReciboSepaRow[]).filter(
        (row) => isSepaMetodoPago(row.METODO_PAGO) && isReciboBorrador(row.ESTADO_PAGO),
      );

      const includedIds =
        body.id_recibos_incluidos === undefined
          ? null
          : body.id_recibos_incluidos.map((id) => id.trim()).filter(Boolean);
      const sepaRecibosFiltrados =
        includedIds === null
          ? sepaRecibos
          : sepaRecibos.filter((row) => includedIds.includes(row.ID_RECIBO));

      if (sepaRecibosFiltrados.length === 0) {
        return new Response(
          JSON.stringify({ link: null, skipped: true, tx_count: 0 }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const missingMandateNames: string[] = [];
      const missingIbanNames: string[] = [];
      const preparedRecibos: PreparedSepaRecibo[] = [];

      for (const recibo of sepaRecibosFiltrados) {
        const alumnoLabel = resolveAlumnoLabel(recibo);
        const debtorIban = resolveDebtorIban(recibo);
        if (!debtorIban) {
          missingIbanNames.push(alumnoLabel);
          continue;
        }

        const mandato = await fetchSignedMandato(ctx.supabase, recibo.ID_ALUMNO);
        if (!mandato) {
          missingMandateNames.push(alumnoLabel);
          continue;
        }

        const mandateIdRaw = mandato.ID_MANDATO?.trim() || mandato.TOKEN_PUBLICO?.trim();
        if (!mandateIdRaw || !mandato.FIRMADO_AT) {
          missingMandateNames.push(alumnoLabel);
          continue;
        }

        const amount = Number(recibo.TOTAL_DOC ?? 0);
        if (amount <= 0) {
          throw new Error(`Importe invalido en recibo SEPA de ${alumnoLabel} (${recibo.REF_RECIBO}).`);
        }

        const priorCobrado = await hasPriorSepaCobrado(
          ctx.supabase,
          idCliente,
          recibo.ID_ALUMNO,
          recibo.ID_RECIBO,
        );

        preparedRecibos.push({
          recibo,
          alumnoLabel,
          debtorIban,
          debtorName: resolveDebtorName(recibo),
          mandateId: sanitizeSepaId(mandateIdRaw, 35),
          mandateSignedDate: toIsoDate(mandato.FIRMADO_AT),
          amount,
          seqTp: priorCobrado ? "RCUR" : "FRST",
        });
      }

      const errorParts: string[] = [];
      if (missingIbanNames.length > 0) {
        errorParts.push(
          `Falta IBAN del deudor: ${[...new Set(missingIbanNames)].sort((a, b) => a.localeCompare(b, "es")).join(", ")}.`,
        );
      }
      if (missingMandateNames.length > 0) {
        errorParts.push(
          `Mandato SEPA no firmado: ${[...new Set(missingMandateNames)].sort((a, b) => a.localeCompare(b, "es")).join(", ")}.`,
        );
      }
      if (errorParts.length > 0) {
        throw new Error(`No se puede generar el XML SEPA. ${errorParts.join(" ")}`);
      }

      const transactions = buildGroupedSepaTransactions(
        preparedRecibos,
        creditorName,
        mesPeriodo,
        remesa.ID_REMESA,
      );

      const creationDateTime = new Date().toISOString();
      const collectionDate = addDaysIsoDate(5);
      const creditorNameSepa = latinizeSepaText(creditorName);
      const xml = buildPain008Document({
        msgId: sanitizeSepaId(`${remesa.ID_REMESA}-${Date.now()}`, 35),
        creationDateTime,
        initiatingPartyName: creditorNameSepa,
        collectionDate,
        creditorName: creditorNameSepa,
        creditorIban,
        creditorSchemeId,
        remesaId: remesa.ID_REMESA,
        transactions,
      });

      const xmlBytes = new TextEncoder().encode(xml);
      const publicUrl = await uploadSepaXml(
        ctx.supabase,
        idCliente,
        remesa.ID_REMESA,
        xmlBytes,
        remesa.LINK_XML_SEPA,
      );

      const { data: idRemesa, error: saveErr } = await ctx.supabase.rpc("guardar_link_xml_remesa", {
        p_id_cliente: idCliente,
        p_id_centro: idCentro,
        p_id_curso: idCurso,
        p_mes_periodo: mesPeriodo,
        p_link: publicUrl,
      });
      if (saveErr) {
        throw new Error(`XML generado pero no se pudo guardar LINK_XML_SEPA: ${saveErr.message}`);
      }

      return new Response(JSON.stringify({ link: publicUrl, id_remesa: idRemesa, tx_count: transactions.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Error fatal" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
  }),
};
