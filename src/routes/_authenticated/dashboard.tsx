import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, GraduationCap, Users } from "lucide-react";
import { toast } from "sonner";
import { AvisosWidget } from "@/components/dashboard/AvisosWidget";
import { ProfesorMobileMenuGrid } from "@/components/dashboard/ProfesorMobileMenuGrid";
import { CalendarWidget } from "@/components/sesiones/CalendarWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveTenant } from "@/context/AppContext";
import { useProfesorMobileShell } from "@/hooks/useProfesorMobileShell";
import {
  useDashboardLive,
  type DashboardLiveEntity,
} from "@/hooks/useDashboardLive";
import { isAdminRole, isMasterRole } from "@/lib/tenantQuery";
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
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/30"
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-3xl font-semibold">{value}</div>
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

function DashboardPage() {
  const navigate = useNavigate();
  const { rol } = useActiveTenant();
  const showProfesorMobileMenu = useProfesorMobileShell();
  const { data: liveData, isLoading, isError } = useDashboardLive();
  const showCorrectionsPanel = isAdminRole(rol) || isMasterRole(rol);

  const [alumnosOpen, setAlumnosOpen] = useState(false);
  const [profesoresOpen, setProfesoresOpen] = useState(false);
  const [aulasOpen, setAulasOpen] = useState(false);

  useEffect(() => {
    if (isError) {
      toast.error("Error al cargar el panel en vivo");
    }
  }, [isError]);

  if (showProfesorMobileMenu) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <ProfesorMobileMenuGrid />
      </div>
    );
  }

  const profesoresTotal =
    (liveData?.profesores.lista_ocupados.length ?? 0) +
    (liveData?.profesores.lista_libres.length ?? 0);

  const aulasTotal =
    (liveData?.aulas.lista_ocupadas.length ?? 0) + (liveData?.aulas.lista_libres.length ?? 0);

  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem-2rem)] max-h-[calc(100svh-3.5rem-2rem)] w-full max-w-6xl flex-col overflow-hidden sm:h-[calc(100svh-3.5rem-3rem)] sm:max-h-[calc(100svh-3.5rem-3rem)]">
      <div className="mb-4 grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {showCorrectionsPanel && <AvisosWidget />}
        <LiveStatCard
          label="Alumnos"
          value={`${liveData?.alumnos.presentes_count ?? 0} / ${liveData?.alumnos.totales_count ?? 0}`}
          icon={Users}
          loading={isLoading}
          onClick={() => setAlumnosOpen(true)}
        />
        <LiveStatCard
          label="Profesores"
          value={`${liveData?.profesores.ocupados_count ?? 0} / ${profesoresTotal}`}
          icon={GraduationCap}
          loading={isLoading}
          onClick={() => setProfesoresOpen(true)}
        />
        <LiveStatCard
          label="Aulas"
          value={`${liveData?.aulas.ocupadas_count ?? 0} / ${aulasTotal}`}
          icon={Building2}
          loading={isLoading}
          onClick={() => setAulasOpen(true)}
        />
      </div>

      {showCorrectionsPanel && (
        <div className="flex min-h-[550px] min-h-0 flex-1 flex-col overflow-y-auto">
          <CalendarWidget
            embedded
            hideFilters
            defaultVisibleTypes={["leads", "incidencias"]}
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
              items={liveData?.alumnos.lista_presentes ?? []}
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
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Estado de profesores</DialogTitle>
          </DialogHeader>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <TwoColumnLiveList
              leftTitle="Ocupados"
              rightTitle="Libres"
              leftItems={liveData?.profesores.lista_ocupados ?? []}
              rightItems={liveData?.profesores.lista_libres ?? []}
              onLeftClick={(item) => {
                setProfesoresOpen(false);
                navigate({ to: "/profesores", search: { profesorId: item.id } });
              }}
              onRightClick={(item) => {
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
              leftItems={liveData?.aulas.lista_ocupadas ?? []}
              rightItems={liveData?.aulas.lista_libres ?? []}
              onLeftClick={(item) => {
                setAulasOpen(false);
                const sesionId =
                  "id_sesion" in item && typeof item.id_sesion === "string"
                    ? item.id_sesion
                    : null;
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
