import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type MatriculaDashboardRow = {
  ID_MATRICULA: string;
  FECHA_ALTA: string | null;
  FECHA_BAJA: string | null;
  TEXTO_PROFESOR: string;
};

type Props = {
  matricula: MatriculaDashboardRow | null;
  open: boolean;
  onClose: () => void;
};

export function EnrollmentDetailsModal({ matricula, open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Detalle de matrícula</DialogTitle>
          <DialogDescription>Información de la inscripción</DialogDescription>
        </DialogHeader>
        {matricula && (
          <dl className="grid gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Fecha de alta</dt>
              <dd className="font-medium">{matricula.FECHA_ALTA ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fecha de baja</dt>
              <dd className="font-medium">{matricula.FECHA_BAJA ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Profesor</dt>
              <dd className="font-medium">{matricula.TEXTO_PROFESOR}</dd>
            </div>
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}
