/**
 * Exporta PDFs de SOLICITUDES_MATRICULA firmadas a disco (Node + service role).
 *
 * ## Flujo recomendado (por cliente)
 *
 * 1. **Backfill** (solo si hay alumnos Activos sin solicitud firmada):
 *    npx tsx scripts/backfill-matricula-firmada-sintetica.ts <ID_CLIENTE> --dry-run
 *    npx tsx scripts/backfill-matricula-firmada-sintetica.ts <ID_CLIENTE>
 *
 * 2. **Export** (este script):
 *    npx tsx scripts/export-matriculas-pdf.ts <ID_CLIENTE>
 *    npx tsx scripts/export-matriculas-pdf.ts <ID_CLIENTE> --out-dir matriculas-export/<ID_CLIENTE>
 *
 * Requisitos: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.
 *
 * Verificación opcional en UI: Alumnos → alumno → «Descargar matrícula firmada»
 * y comparar con el PDF generado en disco.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "./loadEnv.ts";
import {
  matriculaPdfFilename,
  writeMatriculaPdfToPath,
} from "../src/lib/generateMatriculaPdf.ts";
import {
  mapSolicitudToMatriculaPdfInput,
  verifyMatriculaHashEvidence,
  type SolicitudMatriculaFirmadaRow,
} from "../src/lib/matriculaPdfStaff.ts";

const SOLICITUD_FIRMADA_SELECT =
  "ID_SOLICITUD, ID_ALUMNO, ID_CLIENTE, ID_CENTRO, ESTADO, TOKEN_PUBLICO, DATOS_JSON, NOMBRE_FIRMANTE, DNI_FIRMANTE, HASH_EVIDENCIA, FIRMADO_AT, IP_DIRECCION, USER_AGENT" as const;

const EMPRESA_RESUMEN_SELECT =
  "NOMBRE_ESCUELA, APP_LOGO, CIF, DIRECCION, TEXTO_REGIMEN_INTERNO, TEXTO_AUT_MEDIOS, TEXTO_AUT_INSTALACIONES, TEXTO_AUT_WEB, TEXTO_AUT_RRSS, TEXTO_AUT_COMUNICACION" as const;

type EmpresaResumenRow = {
  NOMBRE_ESCUELA?: string | null;
  APP_LOGO?: string | null;
  CIF?: string | null;
  DIRECCION?: string | null;
  TEXTO_REGIMEN_INTERNO?: string | null;
  TEXTO_AUT_MEDIOS?: string | null;
  TEXTO_AUT_INSTALACIONES?: string | null;
  TEXTO_AUT_WEB?: string | null;
  TEXTO_AUT_RRSS?: string | null;
  TEXTO_AUT_COMUNICACION?: string | null;
};

type SolicitudExportRow = SolicitudMatriculaFirmadaRow;

function parseArgs(argv: string[]) {
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const idCliente = positional[0]?.trim();
  if (!idCliente) {
    throw new Error(
      "Uso: npx tsx scripts/export-matriculas-pdf.ts <ID_CLIENTE> [--out-dir <ruta>]",
    );
  }

  const outDirIndex = argv.indexOf("--out-dir");
  const outDirRaw = outDirIndex >= 0 ? argv[outDirIndex + 1]?.trim() : undefined;
  const outDir = outDirRaw || path.join("matriculas-export", idCliente);

  return { idCliente, outDir };
}

function payloadCentroId(solicitud: SolicitudMatriculaFirmadaRow): string | null {
  return solicitud.DATOS_JSON?.ID_CENTRO ?? solicitud.ID_CENTRO;
}

function exportFilename(solicitud: SolicitudMatriculaFirmadaRow, alumnoNombre: string | null): string {
  const pdfInput = {
    nombreAlumno: alumnoNombre ?? solicitud.DATOS_JSON?.NOMBRE_ALUMNO ?? "Alumno",
  };
  const base = matriculaPdfFilename(pdfInput).replace(/\.pdf$/i, "");
  return `${base}_${solicitud.ID_ALUMNO}.pdf`;
}

async function fetchEmpresaResumen(
  supabase: ReturnType<typeof createClient>,
  idCliente: string,
): Promise<EmpresaResumenRow | null> {
  const { data, error } = await supabase
    .from("VISTA_EMPRESA_CLIENTE")
    .select(EMPRESA_RESUMEN_SELECT)
    .eq("ID_CLIENTE", idCliente)
    .maybeSingle();

  if (error) throw error;
  return (data as EmpresaResumenRow | null) ?? null;
}

async function fetchCentroNombre(
  supabase: ReturnType<typeof createClient>,
  idCentro: string | null | undefined,
): Promise<string | null> {
  const centroId = idCentro?.trim();
  if (!centroId) return null;

  const { data, error } = await supabase
    .from("CENTROS")
    .select("NOMBRE_CENTRO")
    .eq("ID_CENTRO", centroId)
    .maybeSingle();

  if (error) throw error;
  return data?.NOMBRE_CENTRO ?? null;
}

async function main() {
  loadEnvFile();
  const { idCliente, outDir } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: solicitudes, error: solicitudesError } = await supabase
    .from("SOLICITUDES_MATRICULA")
    .select(SOLICITUD_FIRMADA_SELECT)
    .eq("ID_CLIENTE", idCliente)
    .eq("ESTADO", "firmada")
    .order("FIRMADO_AT", { ascending: true });

  if (solicitudesError) throw solicitudesError;

  const rows = (solicitudes ?? []) as SolicitudExportRow[];
  if (rows.length === 0) {
    console.log(`Cliente ${idCliente}: no hay solicitudes firmadas.`);
    return;
  }

  const alumnoIds = [...new Set(rows.map((row) => row.ID_ALUMNO))];
  const { data: alumnos, error: alumnosError } = await supabase
    .from("ALUMNOS")
    .select("ID_ALUMNO, NOMBRE_ALUMNO")
    .in("ID_ALUMNO", alumnoIds);

  if (alumnosError) throw alumnosError;

  const alumnoNombreById = new Map<string, string | null>();
  for (const alumno of alumnos ?? []) {
    alumnoNombreById.set(
      (alumno as { ID_ALUMNO: string; NOMBRE_ALUMNO: string | null }).ID_ALUMNO,
      (alumno as { ID_ALUMNO: string; NOMBRE_ALUMNO: string | null }).NOMBRE_ALUMNO,
    );
  }

  await mkdir(outDir, { recursive: true });
  console.log(`Cliente ${idCliente} | Solicitudes firmadas: ${rows.length} | Destino: ${outDir}`);

  const empresa = await fetchEmpresaResumen(supabase, idCliente);
  const centroCache = new Map<string, string | null>();

  let ok = 0;
  let errores = 0;

  for (const row of rows) {
    const alumnoNombre =
      alumnoNombreById.get(row.ID_ALUMNO) ?? row.DATOS_JSON?.NOMBRE_ALUMNO ?? null;
    const label = `${row.ID_ALUMNO} | ${alumnoNombre ?? "—"}`;

    try {
      const solicitud = row as SolicitudMatriculaFirmadaRow;
      await verifyMatriculaHashEvidence(solicitud);

      const centroId = payloadCentroId(solicitud);
      let nombreCentro: string | null = null;
      if (centroId) {
        if (!centroCache.has(centroId)) {
          centroCache.set(centroId, await fetchCentroNombre(supabase, centroId));
        }
        nombreCentro = centroCache.get(centroId) ?? null;
      }

      const pdfInput = mapSolicitudToMatriculaPdfInput(solicitud, empresa, nombreCentro);
      const filename = exportFilename(solicitud, alumnoNombre);
      const filePath = path.join(outDir, filename);

      await writeMatriculaPdfToPath(pdfInput, filePath);
      ok += 1;
      console.log(`[OK] ${label} → ${filename}`);
    } catch (err) {
      errores += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[error] ${label}: ${message}`);
    }
  }

  console.log("--- Resumen ---");
  console.log(`OK: ${ok}`);
  console.log(`Errores: ${errores}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
