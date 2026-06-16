/**
 * Strict TypeScript definitions matching the exact Supabase column names
 * for the multi-tenant Music School Management SaaS.
 *
 * Column names mirror the database (UPPER_SNAKE_CASE) on purpose.
 * Every domain table carries ID_CLIENTE for tenant isolation.
 */

// ============================================================================
// SHARED PRIMITIVES
// ============================================================================
export type UUID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // ISO 8601
export type TimeStr = string; // HH:mm:ss

export type Rol = "MASTER" | "ADMIN" | "SECRETARIA" | "PROFESOR" | "DIRECCION";

export type EstadoGeneral = "ACTIVO" | "INACTIVO" | "PENDIENTE" | "BAJA";

// ============================================================================
// CORE & MULTI-TENANT
// ============================================================================
export interface Cliente {
  ID_CLIENTE: UUID;
  NOMBRE_ESCUELA: string;
  REF_FACTURA: string | null;
  TLF_REAL: string | null;
  VAPI_ASSISTANT_ID: string | null;
  VAPI_PHONE_NUMBER: string | null;
  URL_WEB: string | null;
  EMAIL_CLIENTE: string | null;
  APP_LOGO: string | null;
  CIF: string | null;
  DIRECCION: string | null;
  ESTADO_CLIENTE: string | null;
  PLAN: string | null;
  METODO_PAGO_PROPIO: string | null;
  PAGO: string | null;
  TARIFA: number | null;
  FECHA_PROXIMO_PLAN: ISODate | null;
  NOMINAS: string | null;
  SECRETARIA: string | null;
  MONTAJE: string | null;
  MONTAJE_PENDIENTE: string | null;
  DESCUENTO: number | null;
  TIPO_COBRO: string | null;
  ESTADO_MANDATO: string | null;
  IBAN: string | null;
  STRIPE_ID: string | null;
  STRIPE_API_KEY: string | null;
  DOCUMENTO_SEPA: string | null;
  HOLDED_CONTACT_ID: string | null;
  HOLDED_API_KEY: string | null;
}

export interface Centro {
  ID_CENTRO: UUID;
  ID_CLIENTE: UUID;
  NOMBRE_CENTRO: string;
  DIRECCION: string | null;
  TELEFONO_CENTRO: string | null;
  EMAIL_CENTRO: string | null;
  ESTADO: EstadoGeneral | string | null;
}

export interface Perfil {
  ID_PERFIL: UUID;
  ID: UUID; // auth.users.id
  ID_CLIENTE: UUID;
  ID_CENTRO: UUID | null;
  ID_PROFESOR: UUID | null;
  NOMBRE: string;
  ROL: Rol;
  created_at: ISODateTime;
  EMAIL: string;
  ESTADO: EstadoGeneral | string | null;
}

// ============================================================================
// PEOPLE & RESOURCES
// ============================================================================
export interface Alumno {
  ID_ALUMNO: UUID;
  ID_CLIENTE: UUID;
  ID_CENTRO: UUID | null;
  NOMBRE_ALUMNO: string;
  TLF_COMUNICACION: string | null;
  MAIL: string | null;
  DNI: string | null;
  TLF_ALUMNO: string | null;
  NOMBRE_MADRE: string | null;
  TLF_MADRE: string | null;
  NOMBRE_PADRE: string | null;
  TLF_PADRE: string | null;
  DIRECCION: string | null;
  CP: string | null;
  NACIMIENTO: ISODate | null;
  DTO_HERMANOS_PORCENTAJE: number | null;
  ESTADO_MATRICULA: string | null;
  MES_DEVOLUCION_RESERVA: string | null;
  ESTADO_RESERVA: string | null;
  AJUSTE_MANUAL_EUR: number | null;
  MOTIVO_AJUSTE: string | null;
  METODO_PAGO: string | null;
  IBAN: string | null;
  TITULAR_CUENTA: string | null;
  TLF_BIZUM: string | null;
  MANDATO: string | null;
  TARJETA: string | null;
  STRIPE_ID: string | null;
  HOLDED_ID: string | null;
  TOTAL_MENSUAL: number | null;
  NOTAS: string | null;
  AUT_MEDIOS: boolean | null;
  AUT_INSTALACIONES: boolean | null;
  AUT_WEB: boolean | null;
  AUT_RRSS: boolean | null;
  AUT_COMUNICACION_TOTAL: boolean | null;
  ESTADO_ALUMNO: string | null;
  FOTO: string | null;
}

export interface Profesor {
  ID_PROFESOR: UUID;
  ID_CLIENTE: UUID;
  NOMBRE_PROFESOR: string;
  TELEFONO: string | null;
  ESPECIALIDAD: string | null;
  AULA: string | null;
  EMAIL_PROFESORES: string | null;
  DNI: string | null;
  N_SEG_SOCIAL: string | null;
  DOMICILIO: string | null;
  NACIMIENTO: ISODate | null;
  FECHA_ALTA: ISODate | null;
  SALDO_VACACIONES: number | null;
  SALDO_AP: number | null;
  FECHA_BAJA: ISODate | null;
}

export interface Aula {
  ID_AULA: UUID;
  ID_CLIENTE: UUID;
  NOMBRE_AULA: string;
  CAPACIDAD: number | null;
  ESPECIALIDAD: string | null;
}

export interface Especialidad {
  ID_ESPECIALIDAD: UUID;
  ID_CLIENTE: UUID;
  ESPECIALIDAD: string;
}

// ============================================================================
// ACADEMICS & OPERATIONS
// ============================================================================
export interface Matricula {
  ID_MATRICULA: UUID;
  ID_CLIENTE: UUID;
  ID_CENTRO: UUID | null;
  ID_ALUMNO: UUID;
  ID_TARIFA: UUID | null;
  ESPECIALIDAD: string | null;
  ESTADO: string | null;
  FECHA_ALTA: ISODate | null;
  FECHA_BAJA: ISODate | null;
  ID_PROFESOR: UUID | null;
}

export interface Tarifa {
  ID_TARIFA: UUID;
  ID_CLIENTE: UUID;
  SERVICIO: string;
  PRECIO: number;
  FORMATO_VENTA: string | null;
  TIPO_COBRO: string | null;
  SESIONES_SEMANALES: number | null;
  TOTAL_HORAS_SEMANALES: number | null;
  DETALLES: string | null;
  COLUMNAS_HORARIOS_MATRICULAS: string | null;
}

export interface Sesion {
  ID_SESION: UUID;
  ID_CLIENTE: UUID;
  ID_MATRICULA: UUID | null;
  ID_HORARIO: UUID | null;
  ID_ALUMNO: UUID | null;
  FECHA_EXACTA: ISODate;
  HORA_INICIO: TimeStr;
  HORA_FIN: TimeStr;
  ID_PROFESOR: UUID | null;
  ID_AULA: UUID | null;
  ESPECIALIDAD: string | null;
  ESTADO: string | null;
  NOTAS: string | null;
  TITULO_CALENDARIO: string | null;
}

export type SesionSemana7 = Sesion;

export interface Grupo {
  ID_GRUPO: UUID;
  ID_CLIENTE: UUID;
  ID_CENTRO: UUID | null;
  ID_ESPECIALIDAD: UUID | null;
  ID_PROFESOR: UUID | null;
  ID_AULA: UUID | null;
  ID_ALUMNOS: UUID[] | null;
  ESTADO: string | null;
  NOMBRE_GRUPO: string;
  DIA_SEMANA: string | null;
  HORA_INICIO: TimeStr | null;
  HORA_FIN: TimeStr | null;
  NIVEL_ETAPA: string | null;
  PLAZAS_MAXIMAS: number | null;
}

export interface GrupoHorario {
  ID_GRUPO_HORARIO: UUID;
  ID_CLIENTE: UUID;
  ID_GRUPO: UUID;
  DIA_SEMANA: string | null;
  HORA_INICIO: TimeStr | null;
  HORA_FIN: TimeStr | null;
  ID_PROFESOR: UUID | null;
  ID_AULA: UUID | null;
  ESTADO: string | null;
}

export interface HorarioMatricula {
  ID_HORARIO: UUID;
  ID_CLIENTE: UUID;
  ID_MATRICULA: UUID;
  ID_ALUMNO: UUID;
  ID_ESPECIALIDAD: UUID | null;
  ID_GRUPO: UUID | null;
  ID_GRUPO_HORARIO: UUID | null;
  ID_PROFESOR: UUID | null;
  ID_AULA: UUID | null;
  ID_TARIFA: UUID | null;
  ESTADO_MATRICULA: string | null;
  TIPO_CLASE: string | null;
  TIPO_SESION: string | null;
  PRECIO: number | null;
  DIA: string | null;
  DURACION: number | null;
  HORA_INICIO: TimeStr | null;
  HORA_FIN: TimeStr | null;
  FALTAS_RECUPERABLES: number | null;
  FALTAS_NO_RECUPERABLES: number | null;
  RECUPERACIONES: number | null;
  SALDO: number | null;
}

export interface Incidencia {
  ID_INCIDENCIA: UUID;
  ID_CLIENTE: UUID;
  ID_MATRICULA: UUID | null;
  ID_HORARIO: UUID | null;
  ID_ALUMNO: UUID | null;
  ID_SESION: UUID | null;
  TIPO_INCIDENCIA: string | null;
  TIPO_FALTA: string | null;
  NOTAS: string | null;
  ID_PROFESOR: UUID | null;
  FECHA_EXACTA: ISODate;
  HORA_INICIO: TimeStr | null;
  HORA_FIN: TimeStr | null;
  ESTADO_CONSULTA: string | null;
  ID_ESPECIALIDAD: UUID | null;
}

export interface Lead {
  ID_LEAD: UUID;
  FECHA: ISODateTime;
  ID_CLIENTE: UUID;
  NOMBRE: string;
  NOMBRE_CONTACTO: string | null;
  TELEFONO: string | null;
  ID_PROFESOR: UUID | null;
  ESPECIALIDAD: string | null;
  DIA: string | null;
  HORA_INICIO: TimeStr | null;
  HORA_FIN: TimeStr | null;
  ESTADO: string | null;
  RESUMEN: string | null;
  ID_AULA: UUID | null;
  CLASE_REALIZADA: boolean | null;
}

// ============================================================================
// BILLING & HR
// ============================================================================
export interface ReciboMensual {
  ID_RECIBO: UUID;
  ID_CLIENTE: UUID;
  REF_RECIBO: string;
  ID_ALUMNO: UUID;
  MAIL: string | null;
  TLF: string | null;
  FECHA: ISODate;
  MES_PERIODO: string;
  RECEPTOR_NOMBRE: string | null;
  CIF_DNI: string | null;
  DIRECCION: string | null;
  TIPO_DOC: string | null;
  METODO_PAGO: string | null;
  TOTAL_BASE: number;
  DESCUENTO: number | null;
  TOTAL_IVA: number | null;
  TOTAL_DOC: number;
  NUM_FACTURA_HOLDED: string | null;
  LINK_FACTURA_HOLDED: string | null;
  HUELLA_HASH: string | null;
  URL_QR: string | null;
  LINK_PDF_RECIBO: string | null;
  ESTADO_PAGO: string | null;
}

export interface VentaLinea {
  ID_LINEA: UUID;
  ID_CLIENTE: UUID;
  ID_RECIBO: UUID;
  CONCEPTO: string;
  ID_MATRICULA: UUID | null;
  CANTIDAD: number;
  PRECIO_UNITARIO: number;
  DESCUENTO_LINEA: number | null;
  IVA_PORCENTAJE: number | null;
  SUBTOTAL: number;
}

export interface ControlRemesa {
  ID_REMESA: UUID;
  ID_CLIENTE: UUID;
  MES_PERIODO: string;
  ESTADO: string | null;
  LINK_XML_SEPA: string | null;
  LINK_EXCEL_CONTABILIDAD: string | null;
  LINK_RECIBOS_ZIP: string | null;
}

export interface AusenciaPermiso {
  ID_CLIENTE: UUID;
  ID_PROFESOR: UUID;
  ID_PERMISO: UUID;
  TIPO: string;
  FECHA_INICIO: ISODate;
  FECHA_FIN: ISODate;
  ESTADO: string | null;
  JUSTIFICANTE: string | null;
  GASTO_VACACIONES: number | null;
  GASTO_AP: number | null;
}

export interface Fichaje {
  ID_CLIENTE: UUID;
  ID_FICHAJE: UUID;
  ID_PROFESOR: UUID;
  TIPO_MOVIMIENTO: string;
  MODALIDAD: string | null;
  FECHA_HORA: ISODateTime;
  IP_FICHAJE: string | null;
  USER_AGENT: string | null;
  LATITUD_LONGITUD: string | null;
  UBICACION: string | null;
  METODO: string | null;
  NOTAS: string | null;
  TOTAL_HORAS_INTERVALO: number | null;
  TOTAL_HORAS_ACUMULADAS_DIA: number | null;
  ID_FICHAJE_CORREGIDO: UUID | null;
  MODIFICADO_POR: UUID | null;
  FECHA_HORA_MODIFICACION: ISODateTime | null;
  MOTIVO_MODIFICACION: string | null;
  FECHA_HORA_MANUAL: ISODateTime | null;
}

export interface AuditoriaLog {
  ID_AUDITORIA?: UUID;
  ID_CLIENTE: UUID;
  TIPO_EVENTO: string;
  MENSAJE: string;
  DETALLE: string | null;
  ID_PROFESOR: UUID | null;
  ID_USUARIO: UUID | null;
}

export interface TurnoProfesor {
  ID_TURNO: UUID;
  ID_CLIENTE: UUID;
  ID_PROFESOR: UUID;
  DIA_SEMANA: string;
  ABRE_MAÑANA: TimeStr | null;
  CIERRA_MAÑANA: TimeStr | null;
  ABRE_TARDE: TimeStr | null;
  CIERRA_TARDE: TimeStr | null;
  ESPECIALIDAD: string | null;
}

export interface PrestamoMaterial {
  ID_PRESTAMO: UUID;
  ID_CLIENTE: UUID;
  ID_CENTRO: UUID | null;
  ID_RECEPTOR: UUID | null;
  ELEMENTO: string | null;
  CATEGORIA: string | null;
  ESTADO_MATERIAL: string | null;
  NUM_SERIE: string | null;
  FECHA_PRESTAMO: ISODate | null;
  FECHA_FIN_PRESTAMO: ISODate | null;
  FECHA_DEVOLUCION: ISODate | null;
  ESTADO_DEVOLUCION: string | null;
  NOTAS: string | null;
  CREADO_POR: string | null;
  RECOGIDO_POR: string | null;
  CREATED_AT: ISODateTime | null;
  UPDATED_AT: ISODateTime | null;
}

export interface Evaluacion {
  ID_EVALUACION: UUID;
  ID_CLIENTE: UUID;
  ANO: string;
  TRIMESTRE: string;
  CURSO: string;
  ID_ALUMNO: UUID;
  ID_ESPECIALIDAD: UUID;
  ID_PROFESOR: UUID | null;
  ID_RUBRICA: UUID | null;
  NOTA_MEDIA: number | null;
  COMENTARIOS: string | null;
  RESULTADOS_RUBRICA: Record<string, unknown> | null;
  CREADO_POR: string | null;
  MODIFICADO_POR: string | null;
  CREATED_AT: ISODateTime | null;
  UPDATED_AT: ISODateTime | null;
}

export interface Rubrica {
  ID_RUBRICA: UUID;
  ID_CLIENTE: UUID;
  NOMBRE: string;
  DESCRIPCION: string | null;
  ESTADO: string | null;
  ESTRUCTURA: Record<string, unknown> | null;
  CREATED_AT: ISODateTime | null;
  UPDATED_AT: ISODateTime | null;
}

// ============================================================================
// AUXILIARY
// ============================================================================
export interface DocumentoLegal {
  ID_CLIENTE: UUID;
  [key: string]: unknown;
}
export interface HorarioComercial {
  ID_CLIENTE: UUID;
  [key: string]: unknown;
}
export interface GeneradorInforme {
  ID_CLIENTE: UUID;
  [key: string]: unknown;
}
export interface FiltroSesion {
  ID_CLIENTE: UUID;
  [key: string]: unknown;
}

export interface AvisosInternos {
  ID_AVISO: UUID;
  ID_CLIENTE: UUID;
  ID_ALUMNO: UUID | null;
  ID_ESPECIALIDAD: UUID | null;
  ID_CENTRO: UUID | null;
  ID_CURSO: UUID | null;
  ID_HORARIO: UUID | null;
  ID_PROFESOR?: string | null;
  TIPO: string | null;
  MENSAJE: string | null;
  ESTADO: string | null;
  FECHA: ISODateTime | null;
  LEIDO: boolean | null;
}

// ============================================================================
// SANDBOX (isolated schedule builder prototype)
// ============================================================================
export interface SandboxCalendario {
  ID_SANDBOX_CALENDARIO: UUID;
  ID_CLIENTE: UUID;
  NOMBRE_GRUPO: string;
  /** FullCalendar day index: 1 = Monday … 6 = Saturday */
  DIA: number | null;
  HORA_INICIO: TimeStr | null;
  HORA_FIN: TimeStr | null;
}

// ============================================================================
// UNIFIED VIEWS (relational fetching)
// ============================================================================
export interface SesionWithRelations extends Sesion {
  alumno?: Pick<Alumno, "ID_ALUMNO" | "NOMBRE_ALUMNO"> | null;
  profesor?: Pick<Profesor, "ID_PROFESOR" | "NOMBRE_PROFESOR"> | null;
  aula?: Pick<Aula, "ID_AULA" | "NOMBRE_AULA"> | null;
}

export interface IncidenciaWithRelations extends Incidencia {
  alumno?: Pick<Alumno, "ID_ALUMNO" | "NOMBRE_ALUMNO"> | null;
  profesor?: Pick<Profesor, "ID_PROFESOR" | "NOMBRE_PROFESOR"> | null;
}
