import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  canManageUsuarios,
  scopeWorkspaceQuery,
  tenantListKey,
} from "@/lib/tenantQuery";
import type { UUID } from "@/types/database";

export type CursoEscolarData = {
  ID_CURSO: UUID;
  ID_CLIENTE: UUID | null;
  ID_CENTRO: UUID;
  NOMBRE_CURSO: string;
  FECHA_INICIO: string;
  FECHA_FIN: string;
  FESTIVOS: string[] | null;
  ESTADO: string | null;
};

export type CentroData = {
  ID_CENTRO: UUID;
  ID_CLIENTE: UUID;
  NOMBRE_CENTRO: string;
  DIRECCION: string | null;
  TELEFONO_CENTRO: string | null;
  EMAIL_CENTRO: string | null;
  ESTADO: string | null;
  REF_FACTURA: string | null;
  VAPI_ASSISTANT_ID: string | null;
  VAPI_PHONE_NUMBER: string | null;
  CURSO_ESCOLAR: CursoEscolarData[];
};

function asCursoEscolarArray(raw: unknown): CursoEscolarData[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as CursoEscolarData[];
  return [raw as CursoEscolarData];
}

export function getActiveCursoEscolar(cursos: CursoEscolarData[]): CursoEscolarData | null {
  if (cursos.length === 0) return null;
  return (
    cursos.find((c) => c.ESTADO?.trim().toLowerCase() === "activo") ??
    cursos[0] ??
    null
  );
}

function mapCentroRow(row: Record<string, unknown>): CentroData {
  const { CURSO_ESCOLAR, ...centro } = row;
  return {
    ...(centro as Omit<CentroData, "CURSO_ESCOLAR">),
    CURSO_ESCOLAR: asCursoEscolarArray(CURSO_ESCOLAR),
  };
}

export type CentroCreateInput = {
  NOMBRE_CENTRO: string;
  DIRECCION: string;
  TELEFONO_CENTRO?: string | null;
  EMAIL_CENTRO?: string | null;
};

export type CursoEscolarFormInput = {
  NOMBRE_CURSO: string;
  FECHA_INICIO: string;
  FECHA_FIN: string;
  FESTIVOS: string[];
};

export type CursoEscolarCreateInput = CursoEscolarFormInput & {
  ID_CENTRO: UUID;
};

export type CursoEscolarUpdateInput = CursoEscolarFormInput & {
  ID_CURSO: UUID;
};

function assertCanCreateCentro(rol: string | null | undefined) {
  if (!canManageUsuarios(rol)) {
    throw new Error("No tienes permiso para crear sedes.");
  }
}

function assertCanManageCursoEscolar(rol: string | null | undefined) {
  if (!canManageUsuarios(rol)) {
    throw new Error("No tienes permiso para configurar cursos escolares.");
  }
}

async function resolveActiveClientId(tenantId: string | null | undefined): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    throw new Error("No hay sesión activa. Inicia sesión e inténtalo de nuevo.");
  }
  if (!tenantId) {
    throw new Error(
      "[ERROR_MULTITENANT] No se pudo identificar la escuela activa en la sesión.",
    );
  }
  return tenantId;
}

function buildCursoPayload(input: CursoEscolarFormInput) {
  return {
    NOMBRE_CURSO: input.NOMBRE_CURSO.trim(),
    FECHA_INICIO: input.FECHA_INICIO,
    FECHA_FIN: input.FECHA_FIN,
    FESTIVOS: input.FESTIVOS ?? [],
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

export function useCentros() {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = tenantListKey("centros", rol, tenantId);

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<CentroData[]> => {
      let query = supabase
        .from("CENTROS")
        .select("*, CURSO_ESCOLAR(*)")
        .eq("ESTADO", "ACTIVO");
      query = scopeWorkspaceQuery(query, tenantId, null);
      const { data, error } = await query.order("NOMBRE_CENTRO", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapCentroRow(row as Record<string, unknown>));
    },
  });

  const create = useMutation({
    mutationFn: async (input: CentroCreateInput) => {
      assertCanCreateCentro(rol);
      const payload = {
        ID_CLIENTE: tenantId,
        NOMBRE_CENTRO: input.NOMBRE_CENTRO.trim(),
        DIRECCION: input.DIRECCION.trim(),
        TELEFONO_CENTRO: input.TELEFONO_CENTRO?.trim() || null,
        EMAIL_CENTRO: input.EMAIL_CENTRO?.trim() || null,
      };
      const { data, error } = await supabase
        .from("CENTROS")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return mapCentroRow(data as Record<string, unknown>);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const createCurso = useMutation({
    mutationFn: async (input: CursoEscolarCreateInput) => {
      assertCanManageCursoEscolar(rol);
      const idCliente = await resolveActiveClientId(tenantId);

      const payload = {
        ...buildCursoPayload(input),
        ID_CENTRO: input.ID_CENTRO,
        ID_CLIENTE: idCliente,
        ESTADO: "Activo" as const,
      };

      const { data, error } = await supabase
        .from("CURSO_ESCOLAR")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as CursoEscolarData;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const updateCurso = useMutation({
    mutationFn: async (input: CursoEscolarUpdateInput) => {
      assertCanManageCursoEscolar(rol);
      const idCliente = await resolveActiveClientId(tenantId);

      const { data, error } = await supabase
        .from("CURSO_ESCOLAR")
        .update(buildCursoPayload(input))
        .eq("ID_CURSO", input.ID_CURSO)
        .eq("ID_CLIENTE", idCliente)
        .select();
      if (error) throw error;
      return firstUpdatedRow(data, "el curso escolar") as CursoEscolarData;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const deleteCurso = useMutation({
    mutationFn: async (idCurso: UUID) => {
      assertCanManageCursoEscolar(rol);
      const { error } = await supabase
        .from("CURSO_ESCOLAR")
        .delete()
        .eq("ID_CURSO", idCurso);
      if (error) throw error;
      return idCurso;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, createCurso, updateCurso, deleteCurso };
}
