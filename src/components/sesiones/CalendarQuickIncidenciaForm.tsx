import { useState } from "react";
import { toast } from "sonner";
import { useIncidencias } from "@/hooks/useIncidencias";
import type { AlumnoGrupo, GroupedSession } from "@/hooks/useSesiones";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TIPO_FALTA_OPTIONS = ["Recuperable", "No recuperable"] as const;
const ESTADO_CONSULTA_OPTIONS = ["Pendiente", "Resuelto", "Justificada"] as const;

type QuickKind = "falta" | "consulta";

type CalendarQuickIncidenciaFormProps = {
  block: GroupedSession;
  alumno: AlumnoGrupo;
  kind: QuickKind;
  onCancel: () => void;
  onSuccess: () => void;
};

function blockFechaExacta(block: GroupedSession): string {
  return block.FECHA_EXACTA?.split("T")[0] ?? "";
}

export function CalendarQuickIncidenciaForm({
  block,
  alumno,
  kind,
  onCancel,
  onSuccess,
}: CalendarQuickIncidenciaFormProps) {
  const { create } = useIncidencias();
  const [tipoFalta, setTipoFalta] = useState<string>(TIPO_FALTA_OPTIONS[0]);
  const [estadoConsulta, setEstadoConsulta] = useState<string>("Pendiente");
  const [notas, setNotas] = useState("");

  const handleSave = async () => {
    const alumnoId = alumno.ID_ALUMNO?.trim();
    if (!alumnoId) {
      toast.error("Alumno no válido.");
      return;
    }

    if (kind === "falta") {
      if (!alumno.ID_SESION?.trim()) {
        toast.error("No hay sesión asociada a este alumno en el bloque.");
        return;
      }
      if (!tipoFalta.trim()) {
        toast.error("Selecciona el tipo de falta.");
        return;
      }
    }

    const fechaExacta = blockFechaExacta(block);

    const payload =
      kind === "falta"
        ? {
            ID_ALUMNO: alumnoId,
            TIPO_INCIDENCIA: "Falta",
            TIPO_FALTA: tipoFalta,
            NOTAS: notas.trim() || null,
            ID_PROFESOR: block.ID_PROFESOR,
            ID_ESPECIALIDAD: block.ESPECIALIDAD,
            FECHA_EXACTA: fechaExacta || null,
            HORA_INICIO: block.HORA_INICIO,
            HORA_FIN: block.HORA_FIN,
            ID_SESION: alumno.ID_SESION,
            ID_MATRICULA: alumno.ID_MATRICULA,
            ID_HORARIO: alumno.ID_HORARIO,
            ID_AULA: block.ID_AULA,
            ID_CENTRO: alumno.ID_CENTRO,
            ESTADO_CONSULTA: null,
          }
        : {
            ID_ALUMNO: alumnoId,
            TIPO_INCIDENCIA: "Consulta",
            TIPO_FALTA: null,
            NOTAS: notas.trim() || null,
            ID_PROFESOR: block.ID_PROFESOR,
            ID_ESPECIALIDAD: block.ESPECIALIDAD,
            FECHA_EXACTA: null,
            HORA_INICIO: null,
            HORA_FIN: null,
            ID_SESION: null,
            ID_MATRICULA: null,
            ID_HORARIO: null,
            ID_AULA: block.ID_AULA,
            ID_CENTRO: alumno.ID_CENTRO,
            ESTADO_CONSULTA: estadoConsulta || "Pendiente",
          };

    try {
      await create.mutateAsync(payload);
      toast.success(
        kind === "falta" ? "Falta registrada correctamente." : "Consulta registrada correctamente.",
      );
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar la incidencia.");
    }
  };

  return (
    <div className="mt-2 space-y-3 rounded-md border bg-background p-3">
      <p className="text-xs font-semibold text-muted-foreground">
        {kind === "falta" ? "Registrar falta" : "Registrar consulta"} — {alumno.TEXTO_ALUMNO}
      </p>

      {kind === "falta" ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo de falta</Label>
          <Select value={tipoFalta} onValueChange={setTipoFalta}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Seleccionar tipo" />
            </SelectTrigger>
            <SelectContent>
              {TIPO_FALTA_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs">Estado de la consulta</Label>
          <Select value={estadoConsulta} onValueChange={setEstadoConsulta}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              {ESTADO_CONSULTA_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Notas</Label>
        <Textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="text-xs"
          placeholder="Opcional"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={create.isPending}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSave()}
          disabled={create.isPending}
        >
          Guardar
        </Button>
      </div>
    </div>
  );
}
