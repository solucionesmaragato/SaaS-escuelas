import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Building2, GraduationCap, Users } from "lucide-react";
import { toast } from "sonner";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { AvisosWidget } from "@/components/dashboard/AvisosWidget";
import { CalendarWidget } from "@/components/sesiones/CalendarWidget";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveTenant } from "@/context/AppContext";
import { useDashboardLive, type DashboardLiveEntity } from "@/hooks/useDashboardLive";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
  isSecretariaRole,
} from "@/lib/tenantQuery";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function LiveStatCard({
  label,
  value,
  icon: Icon,
  loading,
  onClick,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <Card className="cursor-pointer transition-colors hover:bg-muted/30" onClick={onClick}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="pb-3 pt-0">
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className="text-xl font-semibold">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function LiveEntityList({
  items,
  emptyLabel,
  onItemClick,
  clickable = true,
}: {
  items: DashboardLiveEntity[];
  emptyLabel: string;
  onItemClick?: (item: DashboardLiveEntity) => void;
  clickable?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            disabled={!clickable || !onItemClick}
            onClick={() => onItemClick?.(item)}
            className={cn(
              "w-full rounded-md border px-3 py-2 text-left text-sm",
              clickable && onItemClick
                ? "cursor-pointer transition-colors hover:bg-muted/50"
                : "cursor-default",
            )}
          >
            {item.nombre}
          </button>
        </li>
      ))}
    </ul>
  );
}

function FourColumnProfesoresList({
  enClaseItems,
  ocupadosItems,
  libresItems,
  alertaGraveItems,
  onItemClick,
}: {
  enClaseItems: DashboardLiveEntity[];
  ocupadosItems: DashboardLiveEntity[];
  libresItems: DashboardLiveEntity[];
  alertaGraveItems: DashboardLiveEntity[];
  onItemClick: (item: DashboardLiveEntity) => void;
}) {
  const columns = [
    {
      key: "en-clase",
      title: "En clase",
      items: enClaseItems,
      className: "bg-blue-50 text-blue-700",
    },
    {
      key: "ocupados",
      title: "Ocupados",
      items: ocupadosItems,
      className: "bg-muted text-muted-foreground",
    },
    {
      key: "libres",
      title: "Libres",
      items: libresItems,
      className: "bg-emerald-50 text-emerald-600",
    },
    {
      key: "alerta-grave",
      title: "Alerta grave",
      items: alertaGraveItems,
      className: "bg-destructive/10 text-destructive",
      icon: AlertTriangle,
    },
  ] as const;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {columns.map((column) => (
        <div key={column.key} className={cn("rounded-lg p-4", column.className)}>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            {"icon" in column && column.icon ? (
              <column.icon className="h-4 w-4 shrink-0" aria-hidden />
            ) : null}
            {column.title}
          </h4>
          <LiveEntityList items={column.items} emptyLabel="Ninguno" onItemClick={onItemClick} />
        </div>
      ))}
    </div>
  );
}

function TwoColumnLiveList({
  leftTitle,
  rightTitle,
  leftItems,
  rightItems,
  onLeftClick,
  onRightClick,
  leftClickable = true,
  rightClickable = true,
}: {
  leftTitle: string;
  rightTitle: string;
  leftItems: DashboardLiveEntity[];
  rightItems: DashboardLiveEntity[];
  onLeftClick?: (item: DashboardLiveEntity) => void;
  onRightClick?: (item: DashboardLiveEntity) => void;
  leftClickable?: boolean;
  rightClickable?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg bg-muted p-4 text-muted-foreground">
        <h4 className="mb-3 text-sm font-semibold">{leftTitle}</h4>
        <LiveEntityList
          items={leftItems}
          emptyLabel="Ninguno"
          onItemClick={onLeftClick}
          clickable={leftClickable && !!onLeftClick}
        />
      </div>
      <div className="rounded-lg bg-emerald-50 p-4 text-emerald-600">
        <h4 className="mb-3 text-sm font-semibold">{rightTitle}</h4>
        <LiveEntityList
          items={rightItems}
          emptyLabel="Ninguna"
          onItemClick={onRightClick}
          clickable={rightClickable && !!onRightClick}
        />
      </div>
    </div>
  );
}

function AdminLiveDashboard() {
  const navigate = useNavigate();
  const { rol, centerId } = useActiveTenant();
  const showCorrectionsPanel = isAdminRole(rol) || isMasterRole(rol);
  const showCalendarWidget = isAdminRole(rol) || isMasterRole(rol) || isSecretariaRole(rol);
  const showAvisosWidget = isAdminRole(rol) || isMasterRole(rol) || isSecretariaRole(rol);
  const canFilterByCentro = showCorrectionsPanel;
  const hasFixedWorkspaceCenter = isSecretariaRole(rol) || isDireccionRole(rol);
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const showDashboardCentroFilter = canFilterByCentro && showCentroFilter;
  const liveCenterId = hasFixedWorkspaceCenter
    ? centerId
    : showDashboardCentroFilter
      ? filterCenterId
      : undefined;
  const { data: liveData, isLoading, isError } = useDashboardLive(liveCenterId);

  const [alumnosOpen, setAlumnosOpen] = useState(false);
  const [profesoresOpen, setProfesoresOpen] = useState(false);
  const [aulasOpen, setAulasOpen] = useState(false);

  useEffect(() => {
    if (isError) {
      toast.error("Error al cargar el panel en vivo");
    }
  }, [isError]);

  const profesoresTotal =
    (liveData?.profesores?.lista_en_clase?.length ?? 0) +
    (liveData?.profesores?.lista_ocupados_sin_fichar?.length ?? 0) +
    (liveData?.profesores?.lista_libres?.length ?? 0) +
    (liveData?.profesores?.lista_alerta_grave?.length ?? 0);
  const profesoresEnClase = liveData?.profesores?.en_clase_count ?? 0;
  const profesoresAlertas = liveData?.profesores?.alerta_grave_count ?? 0;
  const profesoresCardValue =
    profesoresAlertas > 0
      ? `${profesoresEnClase} en clase · ${profesoresAlertas} alertas`
      : `${profesoresEnClase} en clase / ${profesoresTotal}`;

  const aulasTotal =
    (liveData?.aulas?.lista_ocupadas?.length ?? 0) + (liveData?.aulas?.lista_libres?.length ?? 0);

  const avisosFilterCenterId = isSecretariaRole(rol)
    ? centerId
    : showDashboardCentroFilter
      ? filterCenterId
      : undefined;

  return (
    <div className="-m-4 flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden p-4 sm:-m-6 sm:p-6">
      <div className="mb-2 grid shrink-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {showAvisosWidget && <AvisosWidget filterCenterId={avisosFilterCenterId} />}
        <LiveStatCard
          label="Alumnos"
          value={`${liveData?.alumnos?.presentes_count ?? 0} / ${liveData?.alumnos?.totales_count ?? 0}`}
          icon={Users}
          loading={isLoading}
          onClick={() => setAlumnosOpen(true)}
        />
        <LiveStatCard
          label="Profesores"
          value={profesoresCardValue}
          icon={GraduationCap}
          loading={isLoading}
          onClick={() => setProfesoresOpen(true)}
        />
        <LiveStatCard
          label="Aulas"
          value={`${liveData?.aulas?.ocupadas_count ?? 0} / ${aulasTotal}`}
          icon={Building2}
          loading={isLoading}
          onClick={() => setAulasOpen(true)}
        />
      </div>

      {showCalendarWidget && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CalendarWidget
            embedded
            hideFilters
            enableQuickIncidencia
            filterCenterId={avisosFilterCenterId}
            defaultVisibleTypes={["matriculas", "leads", "incidencias"]}
            toolbarRight={
              showDashboardCentroFilter ? (
                <CentroTableFilter
                  id="dashboard-centro-filter"
                  centros={centrosOrdenados}
                  value={selectedCenterId}
                  onChange={setSelectedCenterId}
                  hideLabel
                />
              ) : undefined
            }
          />
        </div>
      )}

      <Dialog open={alumnosOpen} onOpenChange={setAlumnosOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alumnos presentes</DialogTitle>
          </DialogHeader>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <LiveEntityList
              items={liveData?.alumnos?.lista_presentes ?? []}
              emptyLabel="No hay alumnos presentes en este momento."
              onItemClick={(item) => {
                setAlumnosOpen(false);
                if ("tipo" in item && item.tipo === "lead") {
                  navigate({ to: "/leads", search: { leadId: item.id } });
                  return;
                }
                navigate({ to: "/alumnos", search: { alumnoId: item.id } });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={profesoresOpen} onOpenChange={setProfesoresOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Estado de profesores</DialogTitle>
          </DialogHeader>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <FourColumnProfesoresList
              enClaseItems={liveData?.profesores?.lista_en_clase ?? []}
              ocupadosItems={liveData?.profesores?.lista_ocupados_sin_fichar ?? []}
              libresItems={liveData?.profesores?.lista_libres ?? []}
              alertaGraveItems={liveData?.profesores?.lista_alerta_grave ?? []}
              onItemClick={(item) => {
                setProfesoresOpen(false);
                navigate({ to: "/profesores", search: { profesorId: item.id } });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={aulasOpen} onOpenChange={setAulasOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Estado de aulas</DialogTitle>
          </DialogHeader>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <TwoColumnLiveList
              leftTitle="Ocupadas"
              rightTitle="Libres"
              leftItems={liveData?.aulas?.lista_ocupadas ?? []}
              rightItems={liveData?.aulas?.lista_libres ?? []}
              onLeftClick={(item) => {
                setAulasOpen(false);
                const sesionId =
                  "id_sesion" in item && typeof item.id_sesion === "string" ? item.id_sesion : null;
                if (sesionId) {
                  navigate({ to: "/sesiones", search: { sesionId } });
                  return;
                }
                navigate({ to: "/sesiones" });
              }}
              rightClickable={false}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DashboardPage() {
  const { rol } = useActiveTenant();

  if (isProfesorRole(rol)) {
    return <Navigate to="/app" replace />;
  }

  return <AdminLiveDashboard />;
}
