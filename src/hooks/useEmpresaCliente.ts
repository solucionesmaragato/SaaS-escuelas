import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";
import type { UUID } from "@/types/database";

const EMPRESA_TABLE = "VISTA_EMPRESA_CLIENTE" as const;

const EMPRESA_SELECT =
  "ID_CLIENTE, NOMBRE_ESCUELA, TLF_REAL, URL_WEB, EMAIL_CLIENTE, APP_LOGO, CIF, DIRECCION, TEXTO_REGIMEN_INTERNO, TEXTO_AUT_MEDIOS, TEXTO_AUT_INSTALACIONES, TEXTO_AUT_WEB, TEXTO_AUT_RRSS, TEXTO_AUT_COMUNICACION" as const;

export type EmpresaClienteData = {
  ID_CLIENTE: UUID;
  NOMBRE_ESCUELA: string;
  TLF_REAL: string | null;
  URL_WEB: string | null;
  EMAIL_CLIENTE: string | null;
  APP_LOGO: string | null;
  CIF: string | null;
  DIRECCION: string | null;
  TEXTO_REGIMEN_INTERNO: string | null;
  TEXTO_AUT_MEDIOS: string | null;
  TEXTO_AUT_INSTALACIONES: string | null;
  TEXTO_AUT_WEB: string | null;
  TEXTO_AUT_RRSS: string | null;
  TEXTO_AUT_COMUNICACION: string | null;
};

export type EmpresaClienteFormInput = {
  NOMBRE_ESCUELA: string;
  TLF_REAL: string;
  URL_WEB: string;
  EMAIL_CLIENTE: string;
  APP_LOGO: string;
  CIF: string;
  DIRECCION: string;
  TEXTO_REGIMEN_INTERNO: string;
  TEXTO_AUT_MEDIOS: string;
  TEXTO_AUT_INSTALACIONES: string;
  TEXTO_AUT_WEB: string;
  TEXTO_AUT_RRSS: string;
  TEXTO_AUT_COMUNICACION: string;
};

export const EMPTY_EMPRESA_FORM: EmpresaClienteFormInput = {
  NOMBRE_ESCUELA: "",
  TLF_REAL: "",
  URL_WEB: "",
  EMAIL_CLIENTE: "",
  APP_LOGO: "",
  CIF: "",
  DIRECCION: "",
  TEXTO_REGIMEN_INTERNO: "",
  TEXTO_AUT_MEDIOS: "",
  TEXTO_AUT_INSTALACIONES: "",
  TEXTO_AUT_WEB: "",
  TEXTO_AUT_RRSS: "",
  TEXTO_AUT_COMUNICACION: "",
};

export function empresaToFormInput(data: EmpresaClienteData): EmpresaClienteFormInput {
  return {
    NOMBRE_ESCUELA: data.NOMBRE_ESCUELA?.trim() ?? "",
    TLF_REAL: data.TLF_REAL?.trim() ?? "",
    URL_WEB: data.URL_WEB?.trim() ?? "",
    EMAIL_CLIENTE: data.EMAIL_CLIENTE?.trim() ?? "",
    APP_LOGO: data.APP_LOGO?.trim() ?? "",
    CIF: data.CIF?.trim() ?? "",
    DIRECCION: data.DIRECCION?.trim() ?? "",
    TEXTO_REGIMEN_INTERNO: data.TEXTO_REGIMEN_INTERNO?.trim() ?? "",
    TEXTO_AUT_MEDIOS: data.TEXTO_AUT_MEDIOS?.trim() ?? "",
    TEXTO_AUT_INSTALACIONES: data.TEXTO_AUT_INSTALACIONES?.trim() ?? "",
    TEXTO_AUT_WEB: data.TEXTO_AUT_WEB?.trim() ?? "",
    TEXTO_AUT_RRSS: data.TEXTO_AUT_RRSS?.trim() ?? "",
    TEXTO_AUT_COMUNICACION: data.TEXTO_AUT_COMUNICACION?.trim() ?? "",
  };
}

function isEmpresaFormComplete(form: EmpresaClienteFormInput): boolean {
  return (
    form.NOMBRE_ESCUELA.trim().length > 0 &&
    form.TLF_REAL.trim().length > 0 &&
    form.URL_WEB.trim().length > 0 &&
    form.EMAIL_CLIENTE.trim().length > 0 &&
    form.CIF.trim().length > 0 &&
    form.DIRECCION.trim().length > 0
  );
}

export type EmpresaClientePatch = {
  NOMBRE_ESCUELA: string;
  TLF_REAL: string;
  URL_WEB: string;
  EMAIL_CLIENTE: string;
  APP_LOGO: string;
  CIF: string;
  DIRECCION: string;
  TEXTO_REGIMEN_INTERNO: string | null;
  TEXTO_AUT_MEDIOS: string | null;
  TEXTO_AUT_INSTALACIONES: string | null;
  TEXTO_AUT_WEB: string | null;
  TEXTO_AUT_RRSS: string | null;
  TEXTO_AUT_COMUNICACION: string | null;
};

export function normalizeUrlWeb(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildEmpresaPatch(form: EmpresaClienteFormInput): EmpresaClientePatch {
  const nullable = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    NOMBRE_ESCUELA: form.NOMBRE_ESCUELA.trim(),
    TLF_REAL: form.TLF_REAL.trim(),
    URL_WEB: normalizeUrlWeb(form.URL_WEB),
    EMAIL_CLIENTE: form.EMAIL_CLIENTE.trim(),
    APP_LOGO: form.APP_LOGO.trim(),
    CIF: form.CIF.trim(),
    DIRECCION: form.DIRECCION.trim(),
    TEXTO_REGIMEN_INTERNO: nullable(form.TEXTO_REGIMEN_INTERNO),
    TEXTO_AUT_MEDIOS: nullable(form.TEXTO_AUT_MEDIOS),
    TEXTO_AUT_INSTALACIONES: nullable(form.TEXTO_AUT_INSTALACIONES),
    TEXTO_AUT_WEB: nullable(form.TEXTO_AUT_WEB),
    TEXTO_AUT_RRSS: nullable(form.TEXTO_AUT_RRSS),
    TEXTO_AUT_COMUNICACION: nullable(form.TEXTO_AUT_COMUNICACION),
  };
}

function firstUpdatedRow<T>(rows: T[] | null, entityLabel: string): T {
  const row = rows?.[0];
  if (!row) {
    throw new Error(
      `No se pudo actualizar ${entityLabel}. Verifica permisos o que el registro exista.`,
    );
  }
  return row;
}

export function useEmpresaCliente() {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = ["empresa-cliente", tenantId] as const;

  const detail = useQuery({
    queryKey,
    enabled: !!tenantId,
    queryFn: async (): Promise<EmpresaClienteData> => {
      if (!tenantId) {
        throw new Error(
          "[ERROR_MULTITENANT] No se pudo identificar la escuela activa en la sesión.",
        );
      }
      const { data, error } = await supabase
        .from(EMPRESA_TABLE)
        .select(EMPRESA_SELECT)
        .eq("ID_CLIENTE", tenantId)
        .maybeSingle();
      if (error) {
        console.error("Supabase Error Details:", error);
        throw error;
      }
      if (!data) {
        throw new Error("No se encontraron datos de la empresa para el workspace activo.");
      }
      return data as EmpresaClienteData;
    },
  });

  const update = useMutation({
    mutationFn: async (form: EmpresaClienteFormInput) => {
      if (!hasPermission(rol, "clientes:write")) {
        throw new Error("No tienes permiso para modificar los datos de la empresa.");
      }
      if (!tenantId) {
        throw new Error(
          "[ERROR_MULTITENANT] No se pudo identificar la escuela activa en la sesión.",
        );
      }
      if (!isEmpresaFormComplete(form)) {
        throw new Error("Todos los campos de la empresa son obligatorios.");
      }

      const patch = buildEmpresaPatch(form);
      const { data, error } = await supabase
        .from(EMPRESA_TABLE)
        .update(patch)
        .eq("ID_CLIENTE", tenantId)
        .select(EMPRESA_SELECT);
      if (error) {
        console.error("Supabase Error Details:", error);
        throw error;
      }
      if (!data?.length) {
        console.error("Supabase Error Details:", {
          code: "PGRST116",
          message:
            "VISTA_EMPRESA_CLIENTE update returned 0 rows. Possible RLS policy block or missing ID_CLIENTE.",
          tenantId,
        });
      }
      return firstUpdatedRow(data, "los datos de la empresa") as EmpresaClienteData;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { detail, update, isFormComplete: isEmpresaFormComplete };
}
