import { createFileRoute } from "@tanstack/react-router";
import { Users, GraduationCap, ClipboardList, UserPlus } from "lucide-react";
import { AvisosWidget } from "@/components/dashboard/AvisosWidget";
import { PendingCorrectionsPanel } from "@/components/fichajes/PendingCorrectionsPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveTenant } from "@/context/AppContext";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { ROLE_LABEL } from "@/lib/rbac";
import { isAdminRole, isMasterRole } from "@/lib/tenantQuery";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function StatCard({ label, value, icon: Icon, loading }: {
  label: string; value: number | string; icon: typeof Users; loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{value}</div>}
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const { cliente, perfil, rol } = useActiveTenant();
  const { data, isLoading } = useDashboardStats();
  const showCorrectionsPanel = isAdminRole(rol) || isMasterRole(rol);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Hola, {perfil.NOMBRE.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          {cliente?.NOMBRE_ESCUELA ?? "Mi escuela"} · {ROLE_LABEL[rol]}
        </p>
      </div>

      {showCorrectionsPanel && <AvisosWidget />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Alumnos"    value={data?.alumnos ?? 0}    icon={Users}           loading={isLoading} />
        <StatCard label="Profesores" value={data?.profesores ?? 0} icon={GraduationCap}   loading={isLoading} />
        <StatCard label="Matrículas" value={data?.matriculas ?? 0} icon={ClipboardList}   loading={isLoading} />
        <StatCard label="Leads"      value={data?.leads ?? 0}      icon={UserPlus}        loading={isLoading} />
      </div>

      {showCorrectionsPanel && <PendingCorrectionsPanel />}

      <Card>
        <CardHeader>
          <CardTitle>Bienvenido a tu panel</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Empieza por gestionar tus <a href="/alumnos" className="font-medium text-primary hover:underline">alumnos</a> o
          revisa la actividad reciente desde la barra lateral. Los menús se adaptan automáticamente según tu rol.
        </CardContent>
      </Card>
    </div>
  );
}
