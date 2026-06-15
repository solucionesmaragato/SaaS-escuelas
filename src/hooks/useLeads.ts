import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  appendIdInFilter,
  centerFilterQueryKey,
  fetchProfesorIdsForCenter,
} from "@/lib/centroFilter";
import {
  isAdminRole,
  isMasterRole,
  isProfesorRole,
  scopeTenantQuery,
  tenantListKey,
} from "@/lib/tenantQuery";

export type ProfesorLookup = {
  ID_PROFESOR: string;
  NOMBRE_PROFESOR: string;
  FECHA_BAJA?: string | null;
};

export type AulaLookup = {
  ID_AULA: string;
  NOMBRE_AULA: string;
};

export type EspecialidadLookup = {
  ID_ESPECIALIDAD: string;
  ESPECIALIDAD: string;
};

export type LeadData = {
  ID_LEAD: string;
  FECHA: string | null;
  ID_CLIENTE: string;
  NOMBRE: string;
  NOMBRE_CONTACTO: string | null;
  TELEFONO: string | null;
  ID_PROFESOR: string | null;
  ESPECIALIDAD: string | null;
  DIA: string | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ESTADO: string | null;
  RESUMEN: string | null;
  ID_AULA: string | null;
  CLASE_REALIZADA: boolean | string | null;
  PROFESOR: { NOMBRE_PROFESOR: string } | null;
  ESPECIALIDADES: { ESPECIALIDAD: string } | null;
  AULA: { NOMBRE_AULA: string } | null;
};

export type LeadsQueryData = {
  leads: LeadData[];
  profesores: ProfesorLookup[];
  aulas: AulaLookup[];
  especialidades: EspecialidadLookup[];
};

export type LeadCreateInput = {
  NOMBRE: string;
  NOMBRE_CONTACTO?: string | null;
  TELEFONO?: string | null;
  ESTADO?: string | null;
  ESPECIALIDAD?: string | null;
  ID_PROFESOR?: string | null;
  ID_AULA?: string | null;
  DIA?: string | null;
  HORA_INICIO?: string | null;
  HORA_FIN?: string | null;
  RESUMEN?: string | null;
  CLASE_REALIZADA?: boolean | null;
  ID_CENTRO?: string | null;
  ID_CURSO?: string | null;
};

export type LeadUpdateInput = Partial<LeadCreateInput>;

type LeadRow = {
  ID_LEAD: string;
  FECHA: string | null;
  ID_CLIENTE: string;
  NOMBRE: string;
  NOMBRE_CONTACTO: string | null;
  TELEFONO: string | null;
  ID_PROFESOR: string | null;
  ESPECIALIDAD: string | null;
  DIA: string | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ESTADO: string | null;
  RESUMEN: string | null;
  ID_AULA: string | null;
  CLASE_REALIZADA: boolean | string | null;
};

function assertCanWrite(rol: string | null | undefined) {
  if (isMasterRole(rol) || isAdminRole(rol)) return;
  throw new Error("No tienes permiso para gestionar leads.");
}

function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sanitizeNullableLeadFields<
  T extends Partial<LeadCreateInput> & { CLASE_REALIZADA?: boolean | null },
>(input: T): T {
  const sanitized = { ...input };

  if ("NOMBRE_CONTACTO" in input) {
    sanitized.NOMBRE_CONTACTO = nullIfEmpty(input.NOMBRE_CONTACTO);
  }
  if ("TELEFONO" in input) {
    sanitized.TELEFONO = nullIfEmpty(input.TELEFONO);
  }
  if ("ESTADO" in input) {
    sanitized.ESTADO = nullIfEmpty(input.ESTADO);
  }
  if ("RESUMEN" in input) {
    sanitized.RESUMEN = nullIfEmpty(input.RESUMEN);
  }
  if ("DIA" in input) {
    sanitized.DIA = nullIfEmpty(input.DIA);
  }
  if ("HORA_INICIO" in input) {
    sanitized.HORA_INICIO = nullIfEmpty(input.HORA_INICIO);
  }
  if ("HORA_FIN" in input) {
    sanitized.HORA_FIN = nullIfEmpty(input.HORA_FIN);
  }
  if ("ID_PROFESOR" in input) {
    sanitized.ID_PROFESOR = nullIfEmpty(input.ID_PROFESOR);
  }
  if ("ID_AULA" in input) {
    sanitized.ID_AULA = nullIfEmpty(input.ID_AULA);
  }
  if ("ESPECIALIDAD" in input) {
    sanitized.ESPECIALIDAD = nullIfEmpty(input.ESPECIALIDAD);
  }

  return sanitized;
}

function mapLeads(
  rows: LeadRow[],
  profesores: ProfesorLookup[],
  aulas: AulaLookup[],
  especialidades: EspecialidadLookup[],
): LeadData[] {
  const profById = new Map(profesores.map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR]));
  const aulaById = new Map(aulas.map((a) => [a.ID_AULA, a.NOMBRE_AULA]));
  const espById = new Map(especialidades.map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD]));

  return rows.map((lead) => ({
    ...lead,
    PROFESOR:
      lead.ID_PROFESOR && profById.get(lead.ID_PROFESOR)
        ? { NOMBRE_PROFESOR: profById.get(lead.ID_PROFESOR)! }
        : null,
    ESPECIALIDADES:
      lead.ESPECIALIDAD && espById.get(lead.ESPECIALIDAD)
        ? { ESPECIALIDAD: espById.get(lead.ESPECIALIDAD)! }
        : null,
    AULA:
      lead.ID_AULA && aulaById.get(lead.ID_AULA)
        ? { NOMBRE_AULA: aulaById.get(lead.ID_AULA)! }
        : null,
  }));
}

export function useLeads(filterCenterId?: string | null) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("leads", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
  ] as const;

  const list = useQuery({
    queryKey,
    enabled: !isProfesorRole(rol),
    queryFn: async (): Promise<LeadsQueryData> => {
      // LEADS has no ID_CENTRO — scope by PERFILES.ID_CENTRO via ID_PROFESOR.
      const profesorIds = await fetchProfesorIdsForCenter(tenantId, filterCenterId);
      if (profesorIds && profesorIds.length === 0) {
        return { leads: [], profesores: [], aulas: [], especialidades: [] };
      }

      let leadsQuery = supabase.from("LEADS").select("*");
      leadsQuery = scopeTenantQuery(leadsQuery, rol, tenantId);
      const scopedLeads = appendIdInFilter(leadsQuery, "ID_PROFESOR", profesorIds);
      if (scopedLeads === "empty") {
        return { leads: [], profesores: [], aulas: [], especialidades: [] };
      }
      leadsQuery = scopedLeads;

      let profesoresQuery = supabase
        .from("PROFESOR")
        .select("ID_PROFESOR, NOMBRE_PROFESOR, FECHA_BAJA")
        .order("NOMBRE_PROFESOR", { ascending: true });
      if (tenantId) {
        profesoresQuery = profesoresQuery.eq("ID_CLIENTE", tenantId);
      }
      if (profesorIds) {
        profesoresQuery = profesoresQuery.in("ID_PROFESOR", profesorIds);
      }

      let especialidadesQuery = supabase
        .from("ESPECIALIDADES")
        .select("ID_ESPECIALIDAD, ESPECIALIDAD")
        .order("ESPECIALIDAD", { ascending: true });
      if (tenantId) {
        especialidadesQuery = especialidadesQuery.eq("ID_CLIENTE", tenantId);
      }

      let aulasQuery = supabase
        .from("AULA")
        .select("ID_AULA, NOMBRE_AULA")
        .order("NOMBRE_AULA", { ascending: true });
      if (tenantId) {
        aulasQuery = aulasQuery.eq("ID_CLIENTE", tenantId);
      }

      const [
        { data: leads, error },
        { data: profesores, error: profError },
        { data: especialidades, error: espError },
        { data: aulas, error: aulaError },
      ] = await Promise.all([
        leadsQuery.order("FECHA", { ascending: false }),
        profesoresQuery,
        especialidadesQuery,
        aulasQuery,
      ]);

      if (error) throw error;
      if (profError) throw profError;
      if (espError) throw espError;
      if (aulaError) throw aulaError;

      const profesoresRows = (profesores ?? []) as ProfesorLookup[];
      const aulasRows = (aulas ?? []) as AulaLookup[];
      const especialidadesRows = (especialidades ?? []) as EspecialidadLookup[];

      return {
        leads: mapLeads(
          (leads ?? []) as LeadRow[],
          profesoresRows,
          aulasRows,
          especialidadesRows,
        ),
        profesores: profesoresRows,
        aulas: aulasRows,
        especialidades: especialidadesRows,
      };
    },
  });

  const create = useMutation({
    mutationFn: async (input: LeadCreateInput) => {
      assertCanWrite(rol);
      if (!tenantId) throw new Error("No hay un tenant activo.");

      const payload = {
        ID_CLIENTE: tenantId,
        ID_CENTRO: nullIfEmpty(input.ID_CENTRO),
        ID_CURSO: nullIfEmpty(input.ID_CURSO),
        NOMBRE: input.NOMBRE.trim(),
        NOMBRE_CONTACTO: nullIfEmpty(input.NOMBRE_CONTACTO),
        TELEFONO: nullIfEmpty(input.TELEFONO),
        ESTADO: nullIfEmpty(input.ESTADO),
        RESUMEN: nullIfEmpty(input.RESUMEN),
        DIA: nullIfEmpty(input.DIA),
        HORA_INICIO: nullIfEmpty(input.HORA_INICIO),
        HORA_FIN: nullIfEmpty(input.HORA_FIN),
        ID_PROFESOR: nullIfEmpty(input.ID_PROFESOR),
        ID_AULA: nullIfEmpty(input.ID_AULA),
        ESPECIALIDAD: nullIfEmpty(input.ESPECIALIDAD),
        CLASE_REALIZADA: input.CLASE_REALIZADA ?? false,
      };

      const { data, error } = await supabase
        .from("LEADS")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LeadUpdateInput }) => {
      assertCanWrite(rol);
      const payload = sanitizeNullableLeadFields(patch);

      const { data, error } = await supabase
        .from("LEADS")
        .update(payload)
        .eq("ID_LEAD", id)
        .eq("ID_CLIENTE", tenantId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertCanWrite(rol);
      const { error } = await supabase
        .from("LEADS")
        .delete()
        .eq("ID_LEAD", id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
