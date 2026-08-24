import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCargosExtra, calcCargoExtraRowTotal, cargoExtraEstadoStatus, formatCargoExtraFecha, canEditCargoExtraRole, type CargoExtraListRow } from "@/hooks/useCargosExtra";
import { CargoExtraCreateDialog } from "@/components/alumnos/CargoExtraCreateDialog";
import { CargoExtraDetailOverlay } from "@/components/alumnos/CargoExtraDetailOverlay";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";
import { formatCurrency } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EntityLink } from "@/components/navigation/EntityLink";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/comprasInternas")({
  component: ComprasInternasPage,
});

const FILTER_ALL_VALUE = "__all__";

function ComprasInternasPage() {
  const { rol } = useActiveTenant();
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
    centrosLoading,
  } = useAdminCentroFilter();
  const [filtroEstado, setFiltroEstado] = useState(FILTER_ALL_VALUE);
  const [selectedCargoExtra, setSelectedCargoExtra] = useState<CargoExtraListRow | null>(null);
  const [cargoExtraDetailOpen, setCargoExtraDetailOpen] = useState(false);
  const [cargoExtraCreateOpen, setCargoExtraCreateOpen] = useState(false);

  const centroNombreById = useMemo(
    () => new Map(centrosOrdenados.map((centro) => [centro.ID_CENTRO, centro.NOMBRE_CENTRO])),
    [centrosOrdenados],
  );

  const { list, create: createCargoExtra, update: updateCargoExtra } = useCargosExtra({
    listFilters: {
      centerId: filterCenterId,
      estado: filtroEstado === FILTER_ALL_VALUE ? null : filtroEstado,
    },
  });
  const { list: alumnosList } = useAlumnos();

  const rows = list.data ?? [];
  const tableColCount = showCentroFilter ? 9 : 8;
  const canEditCargoExtra = canEditCargoExtraRole(rol);

  if (!hasPermission(rol, "recibos:read")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Compras internas"
        description={`${rows.length} cargos extra registrados`}
        actions={
          canEditCargoExtra ? (
            <Button type="button" onClick={() => setCargoExtraCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Añadir cargo extra
            </Button>
          ) : undefined
        }
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="compras-estado-filter">Estado</Label>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger id="compras-estado-filter" className="w-[180px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL_VALUE}>Todos</SelectItem>
                <SelectItem value="Pendiente">Pendiente</SelectItem>
                <SelectItem value="Procesado">Procesado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {showCentroFilter && (
            <CentroTableFilter
              id="compras-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={setSelectedCenterId}
            />
          )}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Alumno</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Precio unit.</TableHead>
                <TableHead className="text-right">IVA %</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                {showCentroFilter && <TableHead>Centro</TableHead>}
                <TableHead>Recibo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading || centrosLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={tableColCount}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : list.isError ? (
                <TableRow>
                  <TableCell colSpan={tableColCount} className="py-6 text-center text-sm text-destructive">
                    {(list.error as Error)?.message ?? "Error al cargar los cargos extra."}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={tableColCount} className="py-10 text-center text-muted-foreground">
                    No hay cargos extra registrados.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={row.ID_CARGO}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedCargoExtra(row);
                      setCargoExtraDetailOpen(true);
                    }}
                  >
                    <TableCell>
                      <EntityLink type="alumno" id={row.ID_ALUMNO}>
                        {row.ALUMNOS?.NOMBRE_ALUMNO?.trim() || "Sin nombre"}
                      </EntityLink>
                    </TableCell>
                    <TableCell>{row.CONCEPTO}</TableCell>
                    <TableCell className="text-right">{row.CANTIDAD}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.PRECIO_UNITARIO)}</TableCell>
                    <TableCell className="text-right">{row.PORCENTAJE_IVA}%</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(calcCargoExtraRowTotal(row))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={cargoExtraEstadoStatus(row.ESTADO)} className="capitalize">
                        {row.ESTADO ?? "—"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>{formatCargoExtraFecha(row)}</TableCell>
                    {showCentroFilter && (
                      <TableCell>
                        {row.ID_CENTRO
                          ? centroNombreById.get(row.ID_CENTRO) ?? row.ID_CENTRO
                          : "—"}
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs">
                      {row.ID_RECIBO_VINCULADO ? (
                        <span title={row.ID_RECIBO_VINCULADO}>Vinculado a recibo</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <CargoExtraCreateDialog
        open={cargoExtraCreateOpen}
        onOpenChange={setCargoExtraCreateOpen}
        alumnos={alumnosList.data ?? []}
        creating={createCargoExtra.isPending}
        onCreate={async (input) => {
          await createCargoExtra.mutateAsync(input);
        }}
      />

      <CargoExtraDetailOverlay
        open={cargoExtraDetailOpen}
        cargo={selectedCargoExtra}
        canEdit={canEditCargoExtra}
        updating={updateCargoExtra.isPending}
        onClose={() => {
          setCargoExtraDetailOpen(false);
          setSelectedCargoExtra(null);
        }}
        onUpdate={(input) => updateCargoExtra.mutateAsync(input)}
        onUpdated={(updated) => {
          setSelectedCargoExtra((prev) => (prev ? { ...prev, ...updated } : updated));
        }}
        alumnoNombre={selectedCargoExtra?.ALUMNOS?.NOMBRE_ALUMNO ?? undefined}
      />
    </div>
  );
}
