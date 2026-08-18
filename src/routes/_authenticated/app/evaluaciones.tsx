import { createFileRoute } from "@tanstack/react-router";
import { TeacherEvaluationsDashboard } from "@/components/evaluaciones/TeacherEvaluationsDashboard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";

type EvaluacionesSearch = {
  alumnoId?: string;
};

export const Route = createFileRoute("/_authenticated/app/evaluaciones")({
  validateSearch: (search: Record<string, unknown>): EvaluacionesSearch => {
    const alumnoId =
      typeof search.alumnoId === "string" && search.alumnoId ? search.alumnoId : undefined;
    return {
      ...(alumnoId ? { alumnoId } : {}),
    };
  },
  component: ProfesorEvaluacionesPage,
});

function ProfesorEvaluacionesPage() {
  const { rol, perfil } = useActiveTenant();

  if (!hasPermission(rol, "evaluaciones:read")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Mis evaluaciones"
        description="Evalúa a tus alumnos de clases individuales y grupos"
      />
      <TeacherEvaluationsDashboard profesorId={perfil.ID_PROFESOR} />
    </div>
  );
}
