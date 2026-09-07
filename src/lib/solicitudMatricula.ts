export type SolicitudMatriculaDatos = {
  NOMBRE_ALUMNO?: string | null;
  DNI?: string | null;
  MAIL?: string | null;
  TLF_ALUMNO?: string | null;
  TLF_COMUNICACION?: string | null;
  NOMBRE_MADRE?: string | null;
  TLF_MADRE?: string | null;
  NOMBRE_PADRE?: string | null;
  TLF_PADRE?: string | null;
  DIRECCION?: string | null;
  CP?: string | null;
  MUNICIPIO?: string | null;
  PROVINCIA?: string | null;
  NACIMIENTO?: string | null;
  METODO_PAGO?: string | null;
  IBAN?: string | null;
  TITULAR_CUENTA?: string | null;
  TLF_BIZUM?: string | null;
  ID_CENTRO?: string | null;
  ID_CURSO?: string | null;
  NOMBRE_CURSO?: string | null;
  ESPECIALIDAD?: string | null; // legacy / compat — FK: un solo ID_ESPECIALIDAD
  ESPECIALIDADES_IDS?: string[];
  ESPECIALIDADES_LABELS?: string[];
  OBSERVACIONES?: string | null;
  TEXTOS_LEGALES?: SolicitudMatriculaTextos;
};

export type SolicitudMatriculaTextos = {
  regimen_interno?: string | null;
  aut_medios?: string | null;
  aut_instalaciones?: string | null;
  aut_web?: string | null;
  aut_rrss?: string | null;
  aut_comunicacion?: string | null;
};

export type MatriculaCursoOption = {
  id_curso: string;
  nombre_curso: string;
};

export type MatriculaEspecialidadOption = {
  id_especialidad: string;
  especialidad: string;
};

export type SolicitudMatriculaPublica = {
  ok: boolean;
  error?: string;
  estado?: string;
  expirada?: boolean;
  expira_at?: string | null;
  escuela?: {
    nombre_escuela?: string | null;
    app_logo?: string | null;
    cif?: string | null;
    direccion?: string | null;
  };
  centro?: {
    nombre_centro?: string | null;
  };
  textos?: SolicitudMatriculaTextos;
  cursos?: MatriculaCursoOption[];
  especialidades?: MatriculaEspecialidadOption[];
  datos?: SolicitudMatriculaDatos;
  firma?: {
    nombre_firmante?: string | null;
    dni_firmante?: string | null;
    firmado_at?: string | null;
    pdf_url?: string | null;
  } | null;
};

export type FirmarSolicitudMatriculaPayload = SolicitudMatriculaDatos & {
  DNI_FIRMANTE: string;
  acepta_regimen: boolean;
  AUT_MEDIOS: boolean;
  AUT_INSTALACIONES: boolean;
  AUT_WEB: boolean;
  AUT_RRSS: boolean;
  AUT_COMUNICACION_TOTAL: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

export function parseMatriculaCursos(value: unknown): MatriculaCursoOption[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const row = asRecord(item);
      const idCurso = typeof row?.id_curso === "string" ? row.id_curso.trim() : "";
      const nombreCurso =
        typeof row?.nombre_curso === "string" ? row.nombre_curso.trim() : "";
      if (!idCurso || !nombreCurso) return null;
      return { id_curso: idCurso, nombre_curso: nombreCurso };
    })
    .filter((item): item is MatriculaCursoOption => item !== null);
}

export function parseMatriculaEspecialidades(value: unknown): MatriculaEspecialidadOption[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const row = asRecord(item);
      const idEspecialidad =
        typeof row?.id_especialidad === "string" ? row.id_especialidad.trim() : "";
      const especialidad =
        typeof row?.especialidad === "string" ? row.especialidad.trim() : "";
      if (!idEspecialidad || !especialidad) return null;
      return { id_especialidad: idEspecialidad, especialidad };
    })
    .filter((item): item is MatriculaEspecialidadOption => item !== null);
}

export function parseSolicitudMatriculaDatos(value: unknown): SolicitudMatriculaDatos | undefined {
  const row = asRecord(value);
  if (!row) return undefined;

  const datos = row as SolicitudMatriculaDatos;
  const especialidadesIds = parseStringArray(row.ESPECIALIDADES_IDS);
  const especialidadesLabels = parseStringArray(row.ESPECIALIDADES_LABELS);

  return {
    ...datos,
    ESPECIALIDADES_IDS: especialidadesIds.length > 0 ? especialidadesIds : undefined,
    ESPECIALIDADES_LABELS:
      especialidadesLabels.length > 0 ? especialidadesLabels : undefined,
  };
}

export function parseSolicitudMatriculaPublica(value: unknown): SolicitudMatriculaPublica {
  const row = asRecord(value);
  if (!row) {
    return { ok: false, error: "Respuesta inválida." };
  }

  const escuela = asRecord(row.escuela);
  const centro = asRecord(row.centro);
  const textos = asRecord(row.textos);
  const firma = asRecord(row.firma);

  return {
    ok: row.ok === true,
    error: typeof row.error === "string" ? row.error : undefined,
    estado: typeof row.estado === "string" ? row.estado : undefined,
    expirada: row.expirada === true,
    expira_at:
      typeof row.expira_at === "string" || row.expira_at === null ? row.expira_at : undefined,
    escuela: escuela
      ? {
          nombre_escuela:
            typeof escuela.nombre_escuela === "string" ? escuela.nombre_escuela : null,
          app_logo: typeof escuela.app_logo === "string" ? escuela.app_logo : null,
          cif: typeof escuela.cif === "string" ? escuela.cif : null,
          direccion: typeof escuela.direccion === "string" ? escuela.direccion : null,
        }
      : undefined,
    centro: centro
      ? {
          nombre_centro:
            typeof centro.nombre_centro === "string" ? centro.nombre_centro : null,
        }
      : undefined,
    textos: textos
      ? {
          regimen_interno:
            typeof textos.regimen_interno === "string" ? textos.regimen_interno : null,
          aut_medios: typeof textos.aut_medios === "string" ? textos.aut_medios : null,
          aut_instalaciones:
            typeof textos.aut_instalaciones === "string" ? textos.aut_instalaciones : null,
          aut_web: typeof textos.aut_web === "string" ? textos.aut_web : null,
          aut_rrss: typeof textos.aut_rrss === "string" ? textos.aut_rrss : null,
          aut_comunicacion:
            typeof textos.aut_comunicacion === "string" ? textos.aut_comunicacion : null,
        }
      : undefined,
    cursos: parseMatriculaCursos(row.cursos),
    especialidades: parseMatriculaEspecialidades(row.especialidades),
    datos: parseSolicitudMatriculaDatos(row.datos),
    firma: firma
      ? {
          nombre_firmante:
            typeof firma.nombre_firmante === "string" ? firma.nombre_firmante : null,
          dni_firmante: typeof firma.dni_firmante === "string" ? firma.dni_firmante : null,
          firmado_at: typeof firma.firmado_at === "string" ? firma.firmado_at : null,
          pdf_url: typeof firma.pdf_url === "string" ? firma.pdf_url : null,
        }
      : null,
  };
}

export function buildMatriculaSignLink(token: string): string {
  return `${window.location.origin}/matricular?token=${encodeURIComponent(token)}`;
}

export function isSolicitudFirmada(estado: string | null | undefined): boolean {
  return estado?.trim().toLowerCase() === "firmada";
}
