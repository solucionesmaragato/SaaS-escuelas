import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";
import type { AvisosInternos } from "@/types/database";

/** Raw row from VISTA_AVISOS_INTERNOS. ID_* fields kept for internal actions (e.g. reassign schedule). */
export type AvisoInternoRaw = AvisosInternos & {
  NOMBRE_LEAD?: string | null;
};

/** Enriched row for table display — human-readable names, IDs retained for logic. */
export type AvisoInterno = AvisoInternoRaw & {
  NOMBRE_ESPECIALIDAD: string | null;
};

/** Columns safe to show in the main UI table (IDs for centro/curso/horario are omitted). */
export const AVISO_INTERNO_TABLE_COLUMNS = [
  { key: "NOMBRE_LEAD", label: "Lead" },
  { key: "NOMBRE_ESPECIALIDAD", label: "Especialidad" },
  { key: "TIPO", label: "Tipo" },
  { key: "MENSAJE", label: "Mensaje" },
  { key: "ESTADO", label: "Estado" },
  { key: "FECHA", label: "Fecha" },
] as const;

export function useAvisosInternos() {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = tenantListKey("avisos-internos", rol, tenantId);

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<AvisoInterno[]> => {
      let avisosQuery = supabase.from("VISTA_AVISOS_INTERNOS").select("*");
      avisosQuery = scopeTenantQuery(avisosQuery, rol, tenantId);

      let especialidadesQuery = supabase
        .from("ESPECIALIDADES")
        .select("ID_ESPECIALIDAD, ESPECIALIDAD");
      especialidadesQuery = scopeTenantQuery(especialidadesQuery, rol, tenantId);

      const [
        { data: avisos, error: avisosError },
        { data: especialidades, error: espError },
      ] = await Promise.all([
        avisosQuery.order("FECHA", { ascending: false }),
        especialidadesQuery,
      ]);

      if (avisosError) throw avisosError;
      if (espError) throw espError;

      const espById = new Map(
        (especialidades ?? []).map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD as string]),
      );

      return ((avisos ?? []) as AvisoInternoRaw[]).map((aviso) => ({
        ...aviso,
        NOMBRE_ESPECIALIDAD: aviso.ID_ESPECIALIDAD
          ? (espById.get(aviso.ID_ESPECIALIDAD) ?? null)
          : null,
      }));
    },
  });

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("AVISOS_INTERNOS")
        .update({ LEIDO: true })
        .eq("ID_AVISO", id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<AvisoInterno[]>(queryKey);
      qc.setQueryData<AvisoInterno[]>(queryKey, (old) =>
        old?.map((aviso) =>
          aviso.ID_AVISO === id ? { ...aviso, LEIDO: true } : aviso,
        ),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, markAsRead };
}
