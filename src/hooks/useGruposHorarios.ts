import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";
import type { GrupoHorario } from "@/types/database";

export type GrupoHorarioSlot = GrupoHorario & {
  GRUPOS: {
    NOMBRE_GRUPO: string;
    ID_ESPECIALIDAD: string | null;
    PLAZAS_MAXIMAS: number | null;
    ID_ALUMNOS: string[] | null;
  } | null;
};

const GRUPO_HORARIO_SELECT = `
  *,
  GRUPOS (
    NOMBRE_GRUPO,
    ID_ESPECIALIDAD,
    PLAZAS_MAXIMAS,
    ID_ALUMNOS
  )
` as const;

export function countGrupoAlumnos(idAlumnos: unknown): number {
  if (Array.isArray(idAlumnos)) return idAlumnos.length;
  if (typeof idAlumnos === "string" && idAlumnos.trim()) {
    try {
      const parsed = JSON.parse(idAlumnos) as unknown;
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

export function useGruposHorarios() {
  const { tenantId, rol } = useActiveTenant();
  const queryKey = tenantListKey("gruposHorarios", rol, tenantId);

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<GrupoHorarioSlot[]> => {
      let query = supabase.from("GRUPOS_HORARIOS").select(GRUPO_HORARIO_SELECT);
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query
        .order("DIA_SEMANA", { ascending: true })
        .order("HORA_INICIO", { ascending: true });
      if (error) throw error;
      return (data ?? []) as GrupoHorarioSlot[];
    },
  });

  return { list };
}

export function formatGrupoHorarioSlotLabel(slot: GrupoHorarioSlot): string {
  const grupo = slot.GRUPOS?.NOMBRE_GRUPO ?? slot.ID_GRUPO;
  const dia = slot.DIA_SEMANA ?? "—";
  const inicio = slot.HORA_INICIO?.slice(0, 5) ?? "—";
  const fin = slot.HORA_FIN?.slice(0, 5) ?? "—";
  return `${grupo} · ${dia} ${inicio}–${fin}`;
}
