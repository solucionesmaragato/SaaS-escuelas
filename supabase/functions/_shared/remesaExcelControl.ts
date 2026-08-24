import type { SupabaseClient } from "jsr:@supabase/supabase-js@^2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

export interface ReciboExcelRow {
  REF_RECIBO: string;
  TOTAL_DOC: number | null;
  METODO_PAGO: string | null;
  NUM_FACTURA_KOREFACTU: string | null;
  ALUMNOS: { NOMBRE_ALUMNO: string | null } | { NOMBRE_ALUMNO: string | null }[] | null;
}

interface RemesaExcelMetaRow {
  ID_REMESA: string;
  LINK_EXCEL_CONTABILIDAD: string | null;
}

const DOCUMENTOS_BUCKET = "documentos-legales";

function resolveAlumnoNombre(row: ReciboExcelRow): string {
  const alumnos = row.ALUMNOS;
  if (Array.isArray(alumnos)) {
    return alumnos[0]?.NOMBRE_ALUMNO?.trim() || "—";
  }
  return alumnos?.NOMBRE_ALUMNO?.trim() || "—";
}

function labelMetodoPagoExcel(metodo: string | null | undefined): string {
  if (!metodo?.trim()) return "Otros";
  const m = metodo.trim().toLowerCase();
  if (m === "sepa" || m.includes("remesa") || m === "giro" || m.includes("iban")) {
    return "Banco";
  }
  if (m === "efectivo") return "Efectivo";
  if (m === "tarjeta") return "Tarjeta";
  if (m === "bizum") return "Bizum";
  return metodo.trim();
}

export function buildControlWorkbook(rows: ReciboExcelRow[]): Uint8Array {
  const sorted = [...rows].sort((a, b) =>
    resolveAlumnoNombre(a).localeCompare(resolveAlumnoNombre(b), "es", { sensitivity: "base" }),
  );

  const sheetRows: (string | number)[][] = [
    ["Alumno", "Nº borrador", "Nº factura", "Método pago", "Importe"],
    ...sorted.map((row) => [
      resolveAlumnoNombre(row),
      row.REF_RECIBO?.trim() || "—",
      row.NUM_FACTURA_KOREFACTU?.trim() || "",
      labelMetodoPagoExcel(row.METODO_PAGO),
      Number(row.TOTAL_DOC ?? 0),
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const lastDataRow = sorted.length + 1;
  const totalRowIndex = sorted.length + 2;
  const totalRow0 = totalRowIndex - 1;
  const breakdownLabels = ["Banco", "Efectivo", "Tarjeta", "Bizum", "Total"] as const;

  worksheet[XLSX.utils.encode_cell({ r: totalRow0, c: 0 })] = { t: "s", v: "Total" };

  if (sorted.length > 0) {
    worksheet[XLSX.utils.encode_cell({ r: totalRow0, c: 4 })] = {
      t: "n",
      f: `SUM(E2:E${lastDataRow})`,
    };
  } else {
    worksheet[XLSX.utils.encode_cell({ r: totalRow0, c: 4 })] = { t: "n", v: 0 };
  }

  breakdownLabels.forEach((label, index) => {
    const row0 = totalRow0 + 1 + index;
    worksheet[XLSX.utils.encode_cell({ r: row0, c: 0 })] = { t: "s", v: label };

    if (sorted.length === 0) {
      worksheet[XLSX.utils.encode_cell({ r: row0, c: 1 })] = { t: "n", v: 0 };
      return;
    }

    if (label === "Total") {
      worksheet[XLSX.utils.encode_cell({ r: row0, c: 1 })] = {
        t: "n",
        f: `SUM(E2:E${lastDataRow})`,
      };
      return;
    }

    worksheet[XLSX.utils.encode_cell({ r: row0, c: 1 })] = {
      t: "n",
      f: `SUMIF(D2:D${lastDataRow},"${label}",E2:E${lastDataRow})`,
    };
  });

  const lastRowIndex = totalRow0 + breakdownLabels.length;
  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
  range.e.r = lastRowIndex;
  range.e.c = 4;
  worksheet["!ref"] = XLSX.utils.encode_range(range);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Control");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

function extractStoragePathFromPublicUrl(publicUrl: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length).split("?")[0] ?? "");
}

async function uploadControlExcel(
  supabase: SupabaseClient,
  idCliente: string,
  idRemesa: string,
  xlsxBytes: Uint8Array,
  previousLink: string | null | undefined,
): Promise<string> {
  const timestamp = Date.now();
  const storagePath = `${idCliente}/remesas/${idRemesa}_control_${timestamp}.xlsx`;
  const { error: uploadErr } = await supabase.storage.from(DOCUMENTOS_BUCKET).upload(storagePath, xlsxBytes, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: false,
  });
  if (uploadErr) {
    throw new Error(`Error al subir Excel de control: ${uploadErr.message}`);
  }

  if (previousLink?.trim()) {
    const oldPath = extractStoragePathFromPublicUrl(previousLink.trim(), DOCUMENTOS_BUCKET);
    if (oldPath?.startsWith(`${idCliente}/remesas/`)) {
      await supabase.storage.from(DOCUMENTOS_BUCKET).remove([oldPath]);
    }
  }

  const { data: urlData } = supabase.storage.from(DOCUMENTOS_BUCKET).getPublicUrl(storagePath);
  if (!urlData.publicUrl) {
    throw new Error("No se pudo obtener la URL publica del Excel de control.");
  }
  return `${urlData.publicUrl}?v=${timestamp}`;
}

export async function regenerarExcelControlRemesa(
  supabase: SupabaseClient,
  params: {
    idCliente: string;
    idCentro: string;
    idCurso: string;
    mesPeriodo: string;
  },
): Promise<string | null> {
  const { idCliente, idCentro, idCurso, mesPeriodo } = params;

  const { data: remesaMeta, error: remesaErr } = await supabase.rpc("get_remesa_excel_meta", {
    p_id_cliente: idCliente,
    p_id_centro: idCentro,
    p_id_curso: idCurso,
    p_mes_periodo: mesPeriodo,
  });
  if (remesaErr) throw remesaErr;

  const remesa = (Array.isArray(remesaMeta) ? remesaMeta[0] : remesaMeta) as RemesaExcelMetaRow | undefined;
  if (!remesa?.ID_REMESA) {
    return null;
  }

  const { data: recibos, error: recibosErr } = await supabase
    .from("RECIBOS_MENSUALES")
    .select("REF_RECIBO, TOTAL_DOC, METODO_PAGO, NUM_FACTURA_KOREFACTU, ALUMNOS(NOMBRE_ALUMNO)")
    .eq("ID_CLIENTE", idCliente)
    .eq("ID_CENTRO", idCentro)
    .eq("ID_CURSO", idCurso)
    .eq("MES_PERIODO", mesPeriodo);
  if (recibosErr) throw recibosErr;

  const xlsxBytes = buildControlWorkbook((recibos ?? []) as ReciboExcelRow[]);
  const publicUrl = await uploadControlExcel(
    supabase,
    idCliente,
    remesa.ID_REMESA,
    xlsxBytes,
    remesa.LINK_EXCEL_CONTABILIDAD,
  );

  const { error: saveErr } = await supabase.rpc("guardar_link_excel_remesa", {
    p_id_cliente: idCliente,
    p_id_centro: idCentro,
    p_id_curso: idCurso,
    p_mes_periodo: mesPeriodo,
    p_link: publicUrl,
  });
  if (saveErr) {
    throw new Error(`Excel generado pero no se pudo guardar LINK_EXCEL_CONTABILIDAD: ${saveErr.message}`);
  }

  return publicUrl;
}
