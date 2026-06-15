import { useMemo, useState } from "react";
import { useCentros, type CentroData } from "@/hooks/useCentros";

const sortLocale = { sensitivity: "base" } as const;

type AdminCentroFilterOptions = {
  /** Tenant-wide tables without ID_CENTRO (e.g. CONTROL_REMESAS, HORARIO_COMERCIAL). */
  tenantWide?: boolean;
};

export function useAdminCentroFilter(options?: AdminCentroFilterOptions) {
  const centros = useCentros();
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);

  const centrosOrdenados = useMemo(
    () =>
      [...(centros.list.data ?? [])].sort((a, b) =>
        a.NOMBRE_CENTRO.localeCompare(b.NOMBRE_CENTRO, "es", sortLocale),
      ),
    [centros.list.data],
  );

  const showCentroFilter =
    centrosOrdenados.length > 1 && !options?.tenantWide;

  return {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId: selectedCenterId,
    centrosLoading: centros.list.isLoading,
  };
}

export type { CentroData };
