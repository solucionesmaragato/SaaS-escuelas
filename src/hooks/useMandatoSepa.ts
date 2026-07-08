import { useQuery } from "@tanstack/react-query";
import {
  fetchMandatoSepaListByAlumnoId,
  mandatoSepaQueryKey,
  type MandatoSepaListResult,
} from "@/lib/mandatosSepa";

const emptyMandatoSepaList: MandatoSepaListResult = {
  mandatos: [],
  current: null,
  history: [],
};

export function useMandatoSepa(alumnoId: string | null | undefined) {
  return useQuery({
    queryKey: mandatoSepaQueryKey(alumnoId ?? ""),
    enabled: Boolean(alumnoId),
    queryFn: async (): Promise<MandatoSepaListResult> => {
      if (!alumnoId) return emptyMandatoSepaList;
      return fetchMandatoSepaListByAlumnoId(alumnoId);
    },
  });
}
