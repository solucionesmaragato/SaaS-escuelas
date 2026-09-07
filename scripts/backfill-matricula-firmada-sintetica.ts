/**
 * One-shot: inserta SOLICITUDES_MATRICULA firmadas sintéticas para alumnos Activos
 * sin solicitud firmada previa (backfill histórico; NO llama firmar_solicitud_matricula).
 *
 * Requisitos: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.
 *
 * Dry-run (máx. 5 alumnos, sin INSERT):
 *   npx tsx scripts/backfill-matricula-firmada-sintetica.ts <ID_CLIENTE> --dry-run
 *
 * Producción (todos los elegibles):
 *   npx tsx scripts/backfill-matricula-firmada-sintetica.ts <ID_CLIENTE>
 *
 * Con límite explícito:
 *   npx tsx scripts/backfill-matricula-firmada-sintetica.ts <ID_CLIENTE> --limit 20
 *
 * Siguiente paso (export masivo a disco):
 *   npx tsx scripts/export-matriculas-pdf.ts <ID_CLIENTE>
 *
 * Verificación en UI:
 *   Alumnos → abrir alumno backfilled → pestaña «Datos de pago» → «Descargar matrícula firmada»
 *   (o botón PDF en el header del overlay si sigue visible).
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "./loadEnv.ts";
import { buildMatriculaEvidenceString } from "../src/lib/matriculaEvidence.ts";
import { computeMatriculaHashEvidence } from "../src/lib/generateMatriculaPdf.ts";
import type { FirmarSolicitudMatriculaPayload, SolicitudMatriculaTextos } from "../src/lib/solicitudMatricula.ts";

const SYNTHETIC_SIGNER_NAME = "Firma administrativa histórica";
const SYNTHETIC_SIGNER_DNI = "N/D";
const DEFAULT_DRY_RUN_LIMIT = 5;

type AlumnoRow = {
  ID_ALUMNO: string;
  ID_CLIENTE: string;
  ID_CENTRO: string | null;
  ID_CURSO: string | null;
  NOMBRE_ALUMNO: string | null;
  DNI: string | null;
  MAIL: string | null;
  TLF_ALUMNO: string | null;
  TLF_COMUNICACION: string | null;
  NOMBRE_MADRE: string | null;
  TLF_MADRE: string | null;
  NOMBRE_PADRE: string | null;
  TLF_PADRE: string | null;
  DIRECCION: string | null;
  CP: string | null;
  MUNICIPIO: string | null;
  PROVINCIA: string | null;
  NACIMIENTO: string | null;
  METODO_PAGO: string | null;
  IBAN: string | null;
  TITULAR_CUENTA: string | null;
  TLF_BIZUM: string | null;
  ESTADO_ALUMNO: string | null;
};

type MatriculaRow = {
  ID_MATRICULA: string;
  ID_CURSO: string | null;
  ESPECIALIDAD: string | null;
  ESTADO: string | null;
  FECHA_ALTA: string | null;
};

type ClienteRow = {
  ID_CLIENTE: string;
  TEXTO_REGIMEN_INTERNO: string | null;
  TEXTO_AUT_MEDIOS: string | null;
  TEXTO_AUT_INSTALACIONES: string | null;
  TEXTO_AUT_WEB: string | null;
  TEXTO_AUT_RRSS: string | null;
  TEXTO_AUT_COMUNICACION: string | null;
};

type CursoRow = {
  ID_CURSO: string;
  NOMBRE_CURSO: string;
};

type EspecialidadRow = {
  ID_ESPECIALIDAD: string;
  ESPECIALIDAD: string;
};

function parseArgs(argv: string[]) {
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const idCliente = positional[0]?.trim();
  if (!idCliente) {
    throw new Error("Uso: npx tsx scripts/backfill-matricula-firmada-sintetica.ts <ID_CLIENTE> [--dry-run] [--limit N]");
  }

  const dryRun = argv.includes("--dry-run");
  const limitIndex = argv.indexOf("--limit");
  const limitRaw = limitIndex >= 0 ? argv[limitIndex + 1] : undefined;
  const limit =
    limitRaw !== undefined
      ? Number.parseInt(limitRaw, 10)
      : dryRun
        ? DEFAULT_DRY_RUN_LIMIT
        : undefined;

  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error("--limit debe ser un entero positivo.");
  }

  return { idCliente, dryRun, limit };
}

function isMatriculaActiva(estado: string | null | undefined): boolean {
  const normalized = estado?.trim().toLowerCase() ?? "";
  return normalized === "activo" || normalized === "activa";
}

function looksLikeEspecialidadId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return true;
  }
  return /^ESP_/i.test(trimmed);
}

function buildTextosLegales(cliente: ClienteRow): SolicitudMatriculaTextos {
  return {
    regimen_interno: cliente.TEXTO_REGIMEN_INTERNO,
    aut_medios: cliente.TEXTO_AUT_MEDIOS,
    aut_instalaciones: cliente.TEXTO_AUT_INSTALACIONES,
    aut_web: cliente.TEXTO_AUT_WEB,
    aut_rrss: cliente.TEXTO_AUT_RRSS,
    aut_comunicacion: cliente.TEXTO_AUT_COMUNICACION,
  };
}

function pickActiveMatricula(matriculas: MatriculaRow[]): MatriculaRow | null {
  const activas = matriculas.filter((row) => isMatriculaActiva(row.ESTADO));
  if (activas.length === 0) return null;
  return [...activas].sort((a, b) => {
    const aTime = a.FECHA_ALTA ? new Date(a.FECHA_ALTA).getTime() : 0;
    const bTime = b.FECHA_ALTA ? new Date(b.FECHA_ALTA).getTime() : 0;
    return bTime - aTime;
  })[0];
}

function resolveEspecialidad(
  matricula: MatriculaRow | null,
  especialidadById: Map<string, string>,
): { ids: string[]; labels: string[] } {
  const raw = matricula?.ESPECIALIDAD?.trim();
  if (!raw) return { ids: [], labels: [] };

  if (looksLikeEspecialidadId(raw)) {
    const label = especialidadById.get(raw);
    return {
      ids: [raw],
      labels: label ? [label] : [],
    };
  }

  return { ids: [], labels: [raw] };
}

function buildPayload(
  alumno: AlumnoRow,
  matricula: MatriculaRow | null,
  nombreCurso: string | null,
  especialidadIds: string[],
  especialidadLabels: string[],
  textosLegales: SolicitudMatriculaTextos,
): FirmarSolicitudMatriculaPayload {
  const idCurso = matricula?.ID_CURSO?.trim() || alumno.ID_CURSO?.trim() || null;

  return {
    NOMBRE_ALUMNO: alumno.NOMBRE_ALUMNO,
    DNI: alumno.DNI,
    MAIL: alumno.MAIL,
    TLF_ALUMNO: alumno.TLF_ALUMNO,
    TLF_COMUNICACION: alumno.TLF_COMUNICACION,
    NOMBRE_MADRE: alumno.NOMBRE_MADRE,
    TLF_MADRE: alumno.TLF_MADRE,
    NOMBRE_PADRE: alumno.NOMBRE_PADRE,
    TLF_PADRE: alumno.TLF_PADRE,
    DIRECCION: alumno.DIRECCION,
    CP: alumno.CP,
    MUNICIPIO: alumno.MUNICIPIO,
    PROVINCIA: alumno.PROVINCIA,
    NACIMIENTO: alumno.NACIMIENTO,
    METODO_PAGO: alumno.METODO_PAGO,
    IBAN: alumno.IBAN,
    TITULAR_CUENTA: alumno.TITULAR_CUENTA,
    TLF_BIZUM: alumno.TLF_BIZUM,
    ID_CENTRO: alumno.ID_CENTRO,
    ID_CURSO: idCurso,
    NOMBRE_CURSO: nombreCurso,
    ESPECIALIDADES_IDS: especialidadIds.length > 0 ? especialidadIds : undefined,
    ESPECIALIDADES_LABELS: especialidadLabels.length > 0 ? especialidadLabels : undefined,
    TEXTOS_LEGALES: textosLegales,
    DNI_FIRMANTE: SYNTHETIC_SIGNER_DNI,
    acepta_regimen: true,
    AUT_MEDIOS: true,
    AUT_INSTALACIONES: true,
    AUT_WEB: true,
    AUT_RRSS: true,
    AUT_COMUNICACION_TOTAL: true,
  };
}

function createToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function main() {
  loadEnvFile();
  const { idCliente, dryRun, limit } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: cliente, error: clienteError } = await supabase
    .from("CLIENTES")
    .select(
      "ID_CLIENTE, TEXTO_REGIMEN_INTERNO, TEXTO_AUT_MEDIOS, TEXTO_AUT_INSTALACIONES, TEXTO_AUT_WEB, TEXTO_AUT_RRSS, TEXTO_AUT_COMUNICACION",
    )
    .eq("ID_CLIENTE", idCliente)
    .maybeSingle();

  if (clienteError) throw clienteError;
  if (!cliente) throw new Error(`Cliente no encontrado: ${idCliente}`);

  const textosLegales = buildTextosLegales(cliente as ClienteRow);

  const { data: alumnos, error: alumnosError } = await supabase
    .from("ALUMNOS")
    .select(
      "ID_ALUMNO, ID_CLIENTE, ID_CENTRO, ID_CURSO, NOMBRE_ALUMNO, DNI, MAIL, TLF_ALUMNO, TLF_COMUNICACION, NOMBRE_MADRE, TLF_MADRE, NOMBRE_PADRE, TLF_PADRE, DIRECCION, CP, MUNICIPIO, PROVINCIA, NACIMIENTO, METODO_PAGO, IBAN, TITULAR_CUENTA, TLF_BIZUM, ESTADO_ALUMNO",
    )
    .eq("ID_CLIENTE", idCliente)
    .ilike("ESTADO_ALUMNO", "activo");

  if (alumnosError) throw alumnosError;

  const alumnoRows = (alumnos ?? []) as AlumnoRow[];
  if (alumnoRows.length === 0) {
    console.log("No hay alumnos Activos para este cliente.");
    return;
  }

  const alumnoIds = alumnoRows.map((row) => row.ID_ALUMNO);
  const { data: firmadas, error: firmadasError } = await supabase
    .from("SOLICITUDES_MATRICULA")
    .select("ID_ALUMNO")
    .eq("ID_CLIENTE", idCliente)
    .eq("ESTADO", "firmada")
    .in("ID_ALUMNO", alumnoIds);

  if (firmadasError) throw firmadasError;

  const firmadaAlumnoIds = new Set(
    (firmadas ?? []).map((row) => (row as { ID_ALUMNO: string }).ID_ALUMNO),
  );
  const candidatos = alumnoRows.filter((row) => !firmadaAlumnoIds.has(row.ID_ALUMNO));
  const targetRows = limit ? candidatos.slice(0, limit) : candidatos;

  console.log(
    `Cliente ${idCliente} | Activos: ${alumnoRows.length} | Sin firmada: ${candidatos.length} | Procesar: ${targetRows.length} | dry-run: ${dryRun}`,
  );

  const { data: matriculas, error: matriculasError } = await supabase
    .from("MATRICULAS")
    .select("ID_MATRICULA, ID_ALUMNO, ID_CURSO, ESPECIALIDAD, ESTADO, FECHA_ALTA")
    .eq("ID_CLIENTE", idCliente)
    .in("ID_ALUMNO", targetRows.map((row) => row.ID_ALUMNO));

  if (matriculasError) throw matriculasError;

  const matriculasByAlumno = new Map<string, MatriculaRow[]>();
  for (const row of (matriculas ?? []) as Array<MatriculaRow & { ID_ALUMNO: string }>) {
    const list = matriculasByAlumno.get(row.ID_ALUMNO) ?? [];
    list.push(row);
    matriculasByAlumno.set(row.ID_ALUMNO, list);
  }

  const cursoIds = new Set<string>();
  for (const alumno of targetRows) {
    const matricula = pickActiveMatricula(matriculasByAlumno.get(alumno.ID_ALUMNO) ?? []);
    const cursoId = matricula?.ID_CURSO?.trim() || alumno.ID_CURSO?.trim();
    if (cursoId) cursoIds.add(cursoId);
  }

  const cursoNombreById = new Map<string, string>();
  if (cursoIds.size > 0) {
    const { data: cursos, error: cursosError } = await supabase
      .from("CURSO_ESCOLAR")
      .select("ID_CURSO, NOMBRE_CURSO")
      .in("ID_CURSO", [...cursoIds]);
    if (cursosError) throw cursosError;
    for (const curso of (cursos ?? []) as CursoRow[]) {
      cursoNombreById.set(curso.ID_CURSO, curso.NOMBRE_CURSO);
    }
  }

  const { data: especialidades, error: especialidadesError } = await supabase
    .from("ESPECIALIDADES")
    .select("ID_ESPECIALIDAD, ESPECIALIDAD")
    .eq("ID_CLIENTE", idCliente);

  if (especialidadesError) throw especialidadesError;

  const especialidadById = new Map<string, string>();
  for (const row of (especialidades ?? []) as EspecialidadRow[]) {
    especialidadById.set(row.ID_ESPECIALIDAD, row.ESPECIALIDAD);
  }

  let insertados = 0;
  let omitidos = 0;
  let errores = 0;

  for (const alumno of targetRows) {
    const matricula = pickActiveMatricula(matriculasByAlumno.get(alumno.ID_ALUMNO) ?? []);
    const cursoId = matricula?.ID_CURSO?.trim() || alumno.ID_CURSO?.trim() || null;
    const nombreCurso = cursoId ? cursoNombreById.get(cursoId) ?? null : null;
    const { ids: especialidadIds, labels: especialidadLabels } = resolveEspecialidad(
      matricula,
      especialidadById,
    );

    const payload = buildPayload(
      alumno,
      matricula,
      nombreCurso,
      especialidadIds,
      especialidadLabels,
      textosLegales,
    );

    const token = createToken();
    const hashEvidencia = await computeMatriculaHashEvidence(
      buildMatriculaEvidenceString(payload, SYNTHETIC_SIGNER_NAME, SYNTHETIC_SIGNER_DNI, token),
    );

    const insertRow = {
      ID_SOLICITUD: crypto.randomUUID(),
      TOKEN_PUBLICO: token,
      ID_CLIENTE: idCliente,
      ID_CENTRO: alumno.ID_CENTRO,
      ID_LEAD: null,
      ID_ALUMNO: alumno.ID_ALUMNO,
      ESTADO: "firmada",
      DATOS_JSON: payload,
      FIRMADO_AT: new Date().toISOString(),
      IP_DIRECCION: "backfill-script",
      USER_AGENT: "scripts/backfill-matricula-firmada-sintetica.ts",
      HASH_EVIDENCIA: hashEvidencia,
      NOMBRE_FIRMANTE: SYNTHETIC_SIGNER_NAME,
      DNI_FIRMANTE: SYNTHETIC_SIGNER_DNI,
      PDF_URL: `client://matricula/${token}`,
      EXPIRA_AT: null,
    };

    if (dryRun) {
      console.log(
        `[dry-run] ${alumno.ID_ALUMNO} | ${alumno.NOMBRE_ALUMNO ?? "—"} | token=${token.slice(0, 8)}…`,
      );
      insertados += 1;
      continue;
    }

    const { error: insertError } = await supabase.from("SOLICITUDES_MATRICULA").insert(insertRow);
    if (insertError) {
      errores += 1;
      console.error(`[error] ${alumno.ID_ALUMNO}: ${insertError.message}`);
      continue;
    }

    insertados += 1;
    console.log(`[insertado] ${alumno.ID_ALUMNO} | ${alumno.NOMBRE_ALUMNO ?? "—"}`);
  }

  omitidos = candidatos.length - targetRows.length;

  console.log("--- Resumen ---");
  console.log(`Insertados: ${insertados}${dryRun ? " (simulados)" : ""}`);
  console.log(`Omitidos (fuera de límite): ${omitidos}`);
  console.log(`Errores: ${errores}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
