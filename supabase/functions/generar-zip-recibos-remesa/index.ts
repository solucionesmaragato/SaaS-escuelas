import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@^2";
import JSZip from "https://esm.sh/jszip@3.10.1";

interface RequestBody {
  id_cliente?: string;
  id_centro?: string;
  id_curso?: string;
  mes_periodo?: string;
}

interface ReciboZipRow {
  ID_RECIBO: string;
  REF_RECIBO: string;
  LINK_PDF_RECIBO: string | null;
  LINK_FACTURA_KOREFACTU: string | null;
  ALUMNOS:
    | { NOMBRE_ALUMNO: string | null }
    | { NOMBRE_ALUMNO: string | null }[]
    | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DOCUMENTOS_BUCKET = "documentos-legales";

function resolveAlumnoNombre(row: ReciboZipRow): string {
  const alumnos = row.ALUMNOS;
  if (Array.isArray(alumnos)) {
    return alumnos[0]?.NOMBRE_ALUMNO?.trim() || "";
  }
  return alumnos?.NOMBRE_ALUMNO?.trim() || "";
}

function extractApellido(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return "";
}

function sanitizeFileSegment(value: string): string {
  return (
    value
      .trim()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "archivo"
  );
}

function buildPdfEntryName(refRecibo: string, alumnoNombre: string): string {
  const ref = sanitizeFileSegment(refRecibo);
  const apellido = sanitizeFileSegment(extractApellido(alumnoNombre));
  if (apellido && apellido !== "archivo") {
    return `${ref}_${apellido}.pdf`;
  }
  return `${ref}.pdf`;
}

function sanitizeZipFileName(mesPeriodo: string): string {
  return mesPeriodo.trim().replace(/[\\/:*?"<>|]/g, "").slice(0, 120) || "remesa";
}

function extractStoragePathFromPublicUrl(publicUrl: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length).split("?")[0] ?? "");
}

function resolveMissingAlumnoLabel(row: ReciboZipRow): string {
  const nombre = resolveAlumnoNombre(row);
  if (nombre) return nombre;
  const ref = row.REF_RECIBO?.trim();
  if (ref) return ref;
  return row.ID_RECIBO;
}

async function fetchPdfBytesSafe(link: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(link.trim());
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function uploadRecibosZip(
  supabase: SupabaseClient,
  idCliente: string,
  idRemesa: string,
  mesPeriodo: string,
  zipBytes: Uint8Array,
  previousLink: string | null | undefined,
): Promise<string> {
  const timestamp = Date.now();
  const zipFileName = `${sanitizeZipFileName(mesPeriodo)}.zip`;
  const storagePath = `${idCliente}/remesas/${idRemesa}_facturas_${timestamp}/${zipFileName}`;

  const { error: uploadErr } = await supabase.storage.from(DOCUMENTOS_BUCKET).upload(storagePath, zipBytes, {
    contentType: "application/zip",
    upsert: false,
  });
  if (uploadErr) {
    throw new Error(`Error al subir ZIP de recibos: ${uploadErr.message}`);
  }

  if (previousLink?.trim()) {
    const oldPath = extractStoragePathFromPublicUrl(previousLink.trim(), DOCUMENTOS_BUCKET);
    if (oldPath?.startsWith(`${idCliente}/remesas/`)) {
      await supabase.storage.from(DOCUMENTOS_BUCKET).remove([oldPath]);
    }
  }

  const { data: urlData } = supabase.storage.from(DOCUMENTOS_BUCKET).getPublicUrl(storagePath);
  if (!urlData.publicUrl) {
    throw new Error("No se pudo obtener la URL publica del ZIP de recibos.");
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
        .select("LINK_RECIBOS_ZIP")
        .eq("ID_REMESA", remesaRow.ID_REMESA)
        .maybeSingle();
      if (remesaLinkErr) throw remesaLinkErr;

      const previousLink =
        (remesaLinkRow as { LINK_RECIBOS_ZIP?: string | null } | null)?.LINK_RECIBOS_ZIP ?? null;

      const { data: recibos, error: recibosErr } = await ctx.supabase
        .from("RECIBOS_MENSUALES")
        .select("ID_RECIBO, REF_RECIBO, LINK_PDF_RECIBO, LINK_FACTURA_KOREFACTU, ALUMNOS(NOMBRE_ALUMNO)")
        .eq("ID_CLIENTE", idCliente)
        .eq("ID_CENTRO", idCentro)
        .eq("ID_CURSO", idCurso)
        .eq("MES_PERIODO", mesPeriodo)
        .order("REF_RECIBO", { ascending: true });
      if (recibosErr) throw recibosErr;

      const allRecibos = (recibos ?? []) as ReciboZipRow[];
      const missingAlumnos = new Set<string>();

      for (const recibo of allRecibos) {
        if (!recibo.LINK_PDF_RECIBO?.trim()) {
          missingAlumnos.add(resolveMissingAlumnoLabel(recibo));
        }
      }

      const zip = new JSZip();
      const usedNames = new Set<string>();
      const usedUuids = new Set<string>();

      for (const recibo of allRecibos) {
        const link = recibo.LINK_PDF_RECIBO?.trim();
        if (!link) {
          continue;
        }

        const ref = recibo.REF_RECIBO?.trim() || recibo.ID_RECIBO;
        const uuid = recibo.LINK_FACTURA_KOREFACTU?.trim() ?? "";
        if (uuid) {
          if (usedUuids.has(uuid)) {
            continue;
          }
          usedUuids.add(uuid);
        }

        const baseEntryName = buildPdfEntryName(ref, resolveAlumnoNombre(recibo));
        let entryName = baseEntryName;
        let suffix = 2;
        while (usedNames.has(entryName)) {
          entryName = baseEntryName.replace(/\.pdf$/i, `_${suffix}.pdf`);
          suffix += 1;
        }

        const pdfBytes = await fetchPdfBytesSafe(link);
        if (!pdfBytes) {
          missingAlumnos.add(resolveMissingAlumnoLabel(recibo));
          continue;
        }

        usedNames.add(entryName);
        zip.file(entryName, pdfBytes);
      }

      const missing_alumnos = Array.from(missingAlumnos);

      if (usedNames.size === 0) {
        return new Response(
          JSON.stringify({ link: null, pdf_count: 0, skipped: true, missing_alumnos }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const zipBytes = new Uint8Array(await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" }));
      const publicUrl = await uploadRecibosZip(
        ctx.supabase,
        idCliente,
        remesaRow.ID_REMESA,
        mesPeriodo,
        zipBytes,
        previousLink,
      );

      const { data: idRemesa, error: saveErr } = await ctx.supabase.rpc("guardar_link_zip_remesa", {
        p_id_cliente: idCliente,
        p_id_centro: idCentro,
        p_id_curso: idCurso,
        p_mes_periodo: mesPeriodo,
        p_link: publicUrl,
      });
      if (saveErr) {
        throw new Error(`ZIP generado pero no se pudo guardar LINK_RECIBOS_ZIP: ${saveErr.message}`);
      }

      return new Response(
        JSON.stringify({
          link: publicUrl,
          id_remesa: idRemesa,
          pdf_count: usedNames.size,
          missing_alumnos,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Error fatal" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
  }),
};
