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
  ESPECIALIDAD?: string | null;
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

export function buildMatriculaSignLink(token: string): string {
  return `${window.location.origin}/matricular?token=${encodeURIComponent(token)}`;
}

export function isSolicitudFirmada(estado: string | null | undefined): boolean {
  return estado?.trim().toLowerCase() === "firmada";
}
