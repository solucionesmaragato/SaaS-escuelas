import { useEffect, useMemo, useState } from "react";
import {
  useProfesorRol,
  type AulaLookup,
  type EspecialidadLookup,
  type ProfesorCreateInput,
  type ProfesorData,
  type ProfesorUpdateInput,
} from "@/hooks/useProfesores";
import type { Rol } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROFESOR_ROL_OPTIONS, sortLocale, toDateInputValue } from "./profesoresShared";

function MultiSelectCheckboxes({
  label,
  options,
  selected,
  onToggle,
  disabled,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="border rounded-md max-h-[160px] overflow-y-auto divide-y">
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay opciones disponibles.
          </p>
        ) : (
          options.map((opt) => {
            const checked = selected.includes(opt.id);
            return (
              <label
                key={opt.id}
                className={`flex items-center gap-2 px-3 py-2 ${disabled ? "cursor-default opacity-60" : "cursor-pointer hover:bg-muted/50"} ${checked ? "bg-muted/20" : ""}`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggle(opt.id)}
                  disabled={disabled}
                />
                <span className="text-sm truncate">{opt.name}</span>
              </label>
            );
          })
        )}
      </div>
      <p className="text-xs text-muted-foreground">{selected.length} seleccionados</p>
    </div>
  );
}

export function ProfesorForm({
  initial,
  isCreate,
  selfProfile,
  aulas,
  especialidades,
  submitting,
  onSubmit,
}: {
  initial?: ProfesorData | null;
  isCreate?: boolean;
  selfProfile?: boolean;
  aulas: AulaLookup[];
  especialidades: EspecialidadLookup[];
  submitting: boolean;
  onSubmit: (values: ProfesorCreateInput | ProfesorUpdateInput) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [tlf, setTlf] = useState("");
  const [dni, setDni] = useState("");
  const [nSegSocial, setNSegSocial] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [nacimiento, setNacimiento] = useState("");
  const [fechaAlta, setFechaAlta] = useState("");
  const [fechaBaja, setFechaBaja] = useState("");
  const [saldoVacaciones, setSaldoVacaciones] = useState("");
  const [saldoAp, setSaldoAp] = useState("");
  const [especialidadIds, setEspecialidadIds] = useState<string[]>([]);
  const [aulaIds, setAulaIds] = useState<string[]>([]);
  const [rol, setRol] = useState<Rol>("PROFESOR");
  const showRolField = isCreate || (!selfProfile && !!initial);
  const rolQuery = useProfesorRol(showRolField && !isCreate ? initial?.ID_PROFESOR : null);
  const rolLoading = showRolField && !isCreate && rolQuery.isLoading;

  const especialidadesOrdenadas = useMemo(
    () =>
      [...especialidades].sort((a, b) =>
        a.ESPECIALIDAD.localeCompare(b.ESPECIALIDAD, "es", sortLocale),
      ),
    [especialidades],
  );

  const aulasOrdenadas = useMemo(
    () => [...aulas].sort((a, b) => a.NOMBRE_AULA.localeCompare(b.NOMBRE_AULA, "es", sortLocale)),
    [aulas],
  );

  useEffect(() => {
    setNombre(initial?.NOMBRE_PROFESOR ?? "");
    setEmail(initial?.EMAIL_PROFESORES ?? "");
    setTlf(initial?.TELEFONO ?? "");
    setDni(initial?.DNI ?? "");
    setNSegSocial(initial?.N_SEG_SOCIAL ?? "");
    setDomicilio(initial?.DOMICILIO ?? "");
    setNacimiento(toDateInputValue(initial?.NACIMIENTO));
    setFechaAlta(toDateInputValue(initial?.FECHA_ALTA));
    setFechaBaja(toDateInputValue(initial?.FECHA_BAJA));
    setSaldoVacaciones(initial?.SALDO_VACACIONES != null ? String(initial.SALDO_VACACIONES) : "");
    setSaldoAp(initial?.SALDO_AP != null ? String(initial.SALDO_AP) : "");
    setEspecialidadIds(Array.isArray(initial?.ESPECIALIDAD) ? initial.ESPECIALIDAD : []);
    setAulaIds(Array.isArray(initial?.AULA) ? initial.AULA : []);
    if (isCreate) {
      setRol("PROFESOR");
    }
  }, [initial, isCreate]);

  useEffect(() => {
    if (!showRolField || isCreate) return;
    if (rolQuery.data) {
      setRol(rolQuery.data);
    } else if (!rolQuery.isLoading) {
      setRol("PROFESOR");
    }
  }, [showRolField, isCreate, rolQuery.data, rolQuery.isLoading]);

  const toggleEspecialidad = (id: string) => {
    setEspecialidadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleAula = (id: string) => {
    setAulaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const parseOptionalNumber = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = parseFloat(trimmed);
    return Number.isNaN(n) ? null : n;
  };

  const readOnly = selfProfile;

  return (
    <form
      id="profesor-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!selfProfile && !nombre.trim()) return;

        if (selfProfile) {
          onSubmit({
            EMAIL_PROFESORES: email.trim() || null,
            TELEFONO: tlf.trim() || null,
            DOMICILIO: domicilio.trim() || null,
            NACIMIENTO: nacimiento || null,
          });
          return;
        }

        const values: ProfesorCreateInput & { FECHA_ALTA?: string | null } = {
          NOMBRE_PROFESOR: nombre.trim(),
          EMAIL_PROFESORES: email.trim() || null,
          TELEFONO: tlf.trim() || null,
          DNI: dni.trim() || null,
          N_SEG_SOCIAL: nSegSocial.trim() || null,
          DOMICILIO: domicilio.trim() || null,
          NACIMIENTO: nacimiento || null,
          FECHA_BAJA: fechaBaja || null,
          SALDO_VACACIONES: parseOptionalNumber(saldoVacaciones),
          SALDO_AP: parseOptionalNumber(saldoAp),
          ESPECIALIDAD: Array.isArray(especialidadIds) ? especialidadIds : [],
          AULA: Array.isArray(aulaIds) ? aulaIds : [],
        };
        if (isCreate) {
          values.ROL = rol;
          onSubmit(values);
          return;
        }
        values.FECHA_ALTA = fechaAlta || null;
        if (showRolField) {
          values.ROL = rol;
        }
        onSubmit(values);
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="prof-nombre">Nombre completo *</Label>
        <Input
          id="prof-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required={!selfProfile}
          disabled={readOnly}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {showRolField && (
          <div className="space-y-2">
            <Label htmlFor="prof-rol">Rol</Label>
            <Select
              value={rol}
              onValueChange={(v) => setRol(v as Rol)}
              disabled={rolLoading || submitting}
            >
              <SelectTrigger id="prof-rol">
                <SelectValue placeholder={rolLoading ? "Cargando rol..." : undefined} />
              </SelectTrigger>
              <SelectContent>
                {PROFESOR_ROL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="prof-email">Email</Label>
          <Input
            id="prof-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prof-tlf">Teléfono</Label>
          <Input id="prof-tlf" value={tlf} onChange={(e) => setTlf(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prof-dni">DNI</Label>
          <Input
            id="prof-dni"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prof-nss">Nº Seg. Social</Label>
          <Input
            id="prof-nss"
            value={nSegSocial}
            onChange={(e) => setNSegSocial(e.target.value)}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prof-nacimiento">Fecha de nacimiento</Label>
          <Input
            id="prof-nacimiento"
            type="date"
            value={nacimiento}
            onChange={(e) => setNacimiento(e.target.value)}
          />
        </div>
        {!isCreate && (
          <div className="space-y-2">
            <Label htmlFor="prof-alta">Fecha de alta</Label>
            <Input
              id="prof-alta"
              type="date"
              value={fechaAlta}
              onChange={(e) => setFechaAlta(e.target.value)}
              disabled={readOnly}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="prof-baja">Fecha de baja</Label>
          <Input
            id="prof-baja"
            type="date"
            value={fechaBaja}
            onChange={(e) => setFechaBaja(e.target.value)}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="prof-domicilio">Domicilio</Label>
          <Input
            id="prof-domicilio"
            value={domicilio}
            onChange={(e) => setDomicilio(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prof-saldo-vac">Saldo vacaciones</Label>
          <Input
            id="prof-saldo-vac"
            type="number"
            step="any"
            value={saldoVacaciones}
            onChange={(e) => setSaldoVacaciones(e.target.value)}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prof-saldo-ap">Saldo AP</Label>
          <Input
            id="prof-saldo-ap"
            type="number"
            step="any"
            value={saldoAp}
            onChange={(e) => setSaldoAp(e.target.value)}
            disabled={readOnly}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MultiSelectCheckboxes
          label="Especialidades"
          options={especialidadesOrdenadas.map((e) => ({
            id: e.ID_ESPECIALIDAD,
            name: e.ESPECIALIDAD,
          }))}
          selected={especialidadIds}
          onToggle={toggleEspecialidad}
          disabled={readOnly}
        />
        <MultiSelectCheckboxes
          label="Aulas"
          options={aulasOrdenadas.map((a) => ({
            id: a.ID_AULA,
            name: a.NOMBRE_AULA,
          }))}
          selected={aulaIds}
          onToggle={toggleAula}
          disabled={readOnly}
        />
      </div>
    </form>
  );
}
