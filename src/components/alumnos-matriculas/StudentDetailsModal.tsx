import { useEffect, useState, type ReactNode } from "react";
import type { Alumno } from "@/types/database";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MESES_ANIO,
  METODOS_PAGO,
  formatNacimientoConEdad,
  isEstadoActivo,
  estadoFromToggle,
} from "@/lib/alumnosMatriculasUtils";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

type AlumnoRow = Alumno & { TOTAL_INCIDENCIAS?: number };

type Props = {
  alumno: AlumnoRow | null;
  open: boolean;
  onClose: () => void;
  canWrite: boolean;
  onPatch: (patch: Partial<Alumno>) => Promise<void>;
};

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function StudentDetailsModal({ alumno, open, onClose, canWrite, onPatch }: Props) {
  const [draft, setDraft] = useState<AlumnoRow | null>(null);

  useEffect(() => {
    if (open && alumno) setDraft({ ...alumno });
  }, [open, alumno]);

  if (!draft) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent />
      </Dialog>
    );
  }

  const save = async (patch: Partial<Alumno>) => {
    try {
      await onPatch(patch);
      setDraft((d) => (d ? { ...d, ...patch } : d));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    }
  };

  const metodo = draft.METODO_PAGO ?? "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl gap-0 p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Detalle del alumno</DialogTitle>
          <DialogDescription>{draft.NOMBRE_ALUMNO}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-5rem)] px-6 pb-6">
          <div className="space-y-6 pr-4 pt-4">
            <div className="flex items-center gap-4">
              <PersonAvatar
                name={draft.NOMBRE_ALUMNO}
                photoUrl={draft.FOTO}
                className="h-20 w-20"
                fallbackClassName="text-lg"
              />
              <DetailField label="Foto">
                <Input
                  value={draft.FOTO ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, FOTO: e.target.value || null })}
                  onBlur={() => canWrite && save({ FOTO: draft.FOTO })}
                  placeholder="URL de la foto"
                />
              </DetailField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField label="Nombre del alumno">
                <Input
                  value={draft.NOMBRE_ALUMNO}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, NOMBRE_ALUMNO: e.target.value })}
                  onBlur={() => canWrite && save({ NOMBRE_ALUMNO: draft.NOMBRE_ALUMNO })}
                />
              </DetailField>
              <DetailField label="Tutor legal A">
                <Input
                  value={draft.NOMBRE_MADRE ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, NOMBRE_MADRE: e.target.value || null })}
                  onBlur={() => canWrite && save({ NOMBRE_MADRE: draft.NOMBRE_MADRE })}
                />
              </DetailField>
              <DetailField label="Teléfono de comunicación">
                <Input
                  value={draft.TLF_COMUNICACION ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, TLF_COMUNICACION: e.target.value || null })}
                  onBlur={() => canWrite && save({ TLF_COMUNICACION: draft.TLF_COMUNICACION })}
                />
              </DetailField>
              <DetailField label="E-mail">
                <Input
                  type="email"
                  value={draft.MAIL ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, MAIL: e.target.value || null })}
                  onBlur={() => canWrite && save({ MAIL: draft.MAIL })}
                />
              </DetailField>
              <DetailField label="DNI">
                <Input
                  value={draft.DNI ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, DNI: e.target.value || null })}
                  onBlur={() => canWrite && save({ DNI: draft.DNI })}
                />
              </DetailField>
              <DetailField label="Teléfono del alumno">
                <Input
                  value={draft.TLF_ALUMNO ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, TLF_ALUMNO: e.target.value || null })}
                  onBlur={() => canWrite && save({ TLF_ALUMNO: draft.TLF_ALUMNO })}
                />
              </DetailField>
              <DetailField label="Teléfono del tutor legal A">
                <Input
                  value={draft.TLF_MADRE ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, TLF_MADRE: e.target.value || null })}
                  onBlur={() => canWrite && save({ TLF_MADRE: draft.TLF_MADRE })}
                />
              </DetailField>
              <DetailField label="Tutor legal B">
                <Input
                  value={draft.NOMBRE_PADRE ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, NOMBRE_PADRE: e.target.value || null })}
                  onBlur={() => canWrite && save({ NOMBRE_PADRE: draft.NOMBRE_PADRE })}
                />
              </DetailField>
              <DetailField label="Teléfono del tutor legal B">
                <Input
                  value={draft.TLF_PADRE ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, TLF_PADRE: e.target.value || null })}
                  onBlur={() => canWrite && save({ TLF_PADRE: draft.TLF_PADRE })}
                />
              </DetailField>
              <DetailField label="Dirección">
                <Input
                  value={draft.DIRECCION ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, DIRECCION: e.target.value || null })}
                  onBlur={() => canWrite && save({ DIRECCION: draft.DIRECCION })}
                />
              </DetailField>
              <DetailField label="CP">
                <Input
                  value={draft.CP ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, CP: e.target.value || null })}
                  onBlur={() => canWrite && save({ CP: draft.CP })}
                />
              </DetailField>
              <DetailField label="Fecha de nacimiento y edad">
                <p className="text-sm font-medium">{formatNacimientoConEdad(draft.NACIMIENTO)}</p>
              </DetailField>
              <DetailField label="Dto. Hermanos %">
                <Input
                  type="number"
                  value={draft.DTO_HERMANOS_PORCENTAJE ?? ""}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      DTO_HERMANOS_PORCENTAJE: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  onBlur={() =>
                    canWrite && save({ DTO_HERMANOS_PORCENTAJE: draft.DTO_HERMANOS_PORCENTAJE })
                  }
                />
              </DetailField>
              <DetailField label="Estado">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isEstadoActivo(draft.ESTADO_MATRICULA)}
                    disabled={!canWrite}
                    onCheckedChange={(checked) => {
                      const val = estadoFromToggle(checked);
                      setDraft({ ...draft, ESTADO_MATRICULA: val });
                      save({ ESTADO_MATRICULA: val });
                    }}
                  />
                  <span className="text-sm">
                    {isEstadoActivo(draft.ESTADO_MATRICULA) ? "Activo" : "Inactivo"}
                  </span>
                </div>
              </DetailField>
              <DetailField label="Mes de devolución de reserva">
                <Select
                  value={draft.MES_DEVOLUCION_RESERVA ?? ""}
                  disabled={!canWrite}
                  onValueChange={(val) => {
                    setDraft({ ...draft, MES_DEVOLUCION_RESERVA: val });
                    save({ MES_DEVOLUCION_RESERVA: val });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar mes" />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES_ANIO.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DetailField>
              <DetailField label="Estado de reserva">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isEstadoActivo(draft.ESTADO_RESERVA)}
                    disabled={!canWrite}
                    onCheckedChange={(checked) => {
                      const val = estadoFromToggle(checked);
                      setDraft({ ...draft, ESTADO_RESERVA: val });
                      save({ ESTADO_RESERVA: val });
                    }}
                  />
                  <span className="text-sm">
                    {isEstadoActivo(draft.ESTADO_RESERVA) ? "Activo" : "Inactivo"}
                  </span>
                </div>
              </DetailField>
              <DetailField label="Ajuste mensual">
                <Input
                  type="number"
                  step="0.01"
                  value={draft.AJUSTE_MANUAL_EUR ?? ""}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      AJUSTE_MANUAL_EUR: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  onBlur={() => canWrite && save({ AJUSTE_MANUAL_EUR: draft.AJUSTE_MANUAL_EUR })}
                />
              </DetailField>
              <DetailField label="Motivo de ajuste">
                <Input
                  value={draft.MOTIVO_AJUSTE ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, MOTIVO_AJUSTE: e.target.value || null })}
                  onBlur={() => canWrite && save({ MOTIVO_AJUSTE: draft.MOTIVO_AJUSTE })}
                />
              </DetailField>
              <DetailField label="Estado alumno">
                <Input
                  value={draft.ESTADO_ALUMNO ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, ESTADO_ALUMNO: e.target.value || null })}
                  onBlur={() => canWrite && save({ ESTADO_ALUMNO: draft.ESTADO_ALUMNO })}
                />
              </DetailField>
              <DetailField label="Total mensual">
                <p className="text-sm font-medium tabular-nums">
                  {formatCurrency(draft.TOTAL_MENSUAL)}
                </p>
              </DetailField>
            </div>

            <DetailField label="Notas">
              <Textarea
                value={draft.NOTAS ?? ""}
                disabled={!canWrite}
                rows={3}
                onChange={(e) => setDraft({ ...draft, NOTAS: e.target.value || null })}
                onBlur={() => canWrite && save({ NOTAS: draft.NOTAS })}
              />
            </DetailField>

            <Separator />

            <DetailField label="Método de pago">
              <Select
                value={metodo}
                disabled={!canWrite}
                onValueChange={(val) => {
                  setDraft({ ...draft, METODO_PAGO: val });
                  save({ METODO_PAGO: val });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar método" />
                </SelectTrigger>
                <SelectContent>
                  {METODOS_PAGO.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DetailField>

            {metodo === "SEPA" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="IBAN">
                  <Input
                    value={draft.IBAN ?? ""}
                    disabled={!canWrite}
                    onChange={(e) => setDraft({ ...draft, IBAN: e.target.value || null })}
                    onBlur={() => canWrite && save({ IBAN: draft.IBAN })}
                  />
                </DetailField>
                <DetailField label="Titular de la cuenta">
                  <Input
                    value={draft.TITULAR_CUENTA ?? ""}
                    disabled={!canWrite}
                    onChange={(e) => setDraft({ ...draft, TITULAR_CUENTA: e.target.value || null })}
                    onBlur={() => canWrite && save({ TITULAR_CUENTA: draft.TITULAR_CUENTA })}
                  />
                </DetailField>
                <DetailField label="Mandato SEPA">
                  <Input
                    value={draft.MANDATO ?? ""}
                    disabled={!canWrite}
                    placeholder="Referencia única del mandato"
                    onChange={(e) => setDraft({ ...draft, MANDATO: e.target.value || null })}
                    onBlur={() => canWrite && save({ MANDATO: draft.MANDATO })}
                  />
                </DetailField>
              </div>
            )}

            {metodo === "BIZUM" && (
              <DetailField label="Teléfono bizum">
                <Input
                  value={draft.TLF_BIZUM ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, TLF_BIZUM: e.target.value || null })}
                  onBlur={() => canWrite && save({ TLF_BIZUM: draft.TLF_BIZUM })}
                />
              </DetailField>
            )}

            {metodo === "Tarjeta" && (
              <DetailField label="Tarjeta">
                <Input
                  value={draft.TARJETA ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setDraft({ ...draft, TARJETA: e.target.value || null })}
                  onBlur={() => canWrite && save({ TARJETA: draft.TARJETA })}
                />
              </DetailField>
            )}

            <Separator />

            <div>
              <h3 className="mb-3 text-sm font-semibold">Autorizaciones</h3>
              <div className="space-y-3">
                {(
                  [
                    ["AUT_MEDIOS", "Autorización imagen y sonido en medios de comunicación"],
                    ["AUT_INSTALACIONES", "Autorización imagen y sonido en instalaciones propias"],
                    ["AUT_WEB", "Autorización imagen y sonido en página web"],
                    ["AUT_RRSS", "Autorización imagen y sonido en RRSS"],
                    [
                      "AUT_COMUNICACION_TOTAL",
                      "Autorización comunicaciones What's app, TLF, E-mail",
                    ],
                  ] as const
                ).map(([key, text]) => (
                  <label key={key} className="flex items-start gap-3 text-sm">
                    <Checkbox
                      checked={!!draft[key]}
                      disabled={!canWrite}
                      onCheckedChange={(checked) => {
                        const val = checked === true;
                        setDraft({ ...draft, [key]: val });
                        save({ [key]: val });
                      }}
                    />
                    <span className="leading-snug">{text}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
