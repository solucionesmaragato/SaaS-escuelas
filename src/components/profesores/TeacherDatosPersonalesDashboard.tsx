import { useMemo } from "react";
import { toast } from "sonner";
import {
  findProfesorByPerfilId,
  useProfesores,
  type ProfesorUpdateInput,
} from "@/hooks/useProfesores";
import { useActiveTenant } from "@/context/AppContext";
import { ProfesorForm } from "@/components/profesores/ProfesorForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function TeacherDatosPersonalesDashboard() {
  const { perfil } = useActiveTenant();
  const { list, update } = useProfesores();

  const aulas = useMemo(() => list.data?.aulas ?? [], [list.data?.aulas]);
  const especialidades = useMemo(
    () => list.data?.especialidades ?? [],
    [list.data?.especialidades],
  );
  const profesores = useMemo(() => list.data?.profesores ?? [], [list.data?.profesores]);
  const miProfesor = useMemo(
    () => findProfesorByPerfilId(profesores, perfil.ID_PROFESOR),
    [profesores, perfil.ID_PROFESOR],
  );

  const handleSave = async (values: ProfesorUpdateInput) => {
    if (!miProfesor) return;
    try {
      await update.mutateAsync({
        id: miProfesor.ID_PROFESOR,
        patch: values,
        selfProfile: true,
      });
      toast.success("Datos personales actualizados.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar.");
    }
  };

  return (
    <Card className="p-4 sm:p-6">
      {list.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : list.isError ? (
        <p className="py-10 text-center text-sm text-destructive">
          Error al cargar tu perfil: {(list.error as Error)?.message}
        </p>
      ) : !perfil.ID_PROFESOR || !miProfesor ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No se encontró tu ficha de profesor en esta escuela.
        </p>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Actualiza tu información de contacto. Los datos de contrato y saldos son de solo lectura.
          </p>
          <div>
            <h2 className="text-lg font-semibold">{miProfesor.NOMBRE_PROFESOR}</h2>
            {miProfesor.EMAIL_PROFESORES ? (
              <p className="text-xs text-muted-foreground">{miProfesor.EMAIL_PROFESORES}</p>
            ) : null}
          </div>

          <ProfesorForm
            key={miProfesor.ID_PROFESOR}
            initial={miProfesor}
            selfProfile
            aulas={aulas}
            especialidades={especialidades}
            submitting={update.isPending}
            onSubmit={handleSave}
          />

          <div className="flex justify-end border-t pt-4">
            <Button type="submit" variant="brand" form="profesor-form" disabled={update.isPending}>
              {update.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
