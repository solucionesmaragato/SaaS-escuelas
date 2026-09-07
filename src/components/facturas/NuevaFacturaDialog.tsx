import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { previewNextRefRecibo, type CreateReciboBorradorInput } from "@/hooks/useRecibos";
import { calcVentaLineaSubtotal } from "@/hooks/useVentasLineas";
import { normalizeMetodoPago } from "@/lib/alumnoPaymentUtils";
import { MESES_ANIO } from "@/lib/alumnosMatriculasUtils";
import { packReciboDireccionJson, streetBeforePipe } from "@/lib/reciboDireccionUtils";
import { scopeTenantQuery } from "@/lib/tenantQuery";
import type { CentroData, CursoEscolarData } from "@/hooks/useCentros";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type AlumnoPickerRow = {
  ID_ALUMNO: string;
  NOMBRE_ALUMNO: string | null;
  DNI: string | null;
  MAIL: string | null;
  TLF_COMUNICACION: string | null;
  DIRECCION: string | null;
  CP: string | null;
  MUNICIPIO: string | null;
  PROVINCIA: string | null;
  NOMBRE_PADRE: string | null;
  NOMBRE_MADRE: string | null;
};

const METODOS_PAGO_FACTURA_MANUAL = ["Transferencia", "Bizum", "Efectivo", "Tarjeta"] as const;

type LineaDraft = {
  key: string;
  CONCEPTO: string;
  CANTIDAD: string;
  PRECIO_UNITARIO: string;
  IVA_PORCENTAJE: string;
};

function resolveDefaultMesPeriodo(): string {
  const now = new Date();
  return `${MESES_ANIO[now.getMonth()]} ${now.getFullYear()}`;
}

function newLineaDraft(): LineaDraft {
  return {
    key: crypto.randomUUID(),
    CONCEPTO: "",
    CANTIDAD: "1",
    PRECIO_UNITARIO: "",
    IVA_PORCENTAJE: "0",
  };
}

function resolveReceptorNombre(alumno: AlumnoPickerRow): string {
  return alumno.NOMBRE_ALUMNO?.trim() || "";
}

export type NuevaFacturaLineaPrefill = {
  CONCEPTO: string;
  CANTIDAD: number;
  PRECIO_UNITARIO: number;
  IVA_PORCENTAJE: number;
};

function lineasFromPrefill(lineas?: NuevaFacturaLineaPrefill[]): LineaDraft[] {
  if (!lineas?.length) return [newLineaDraft()];
  return lineas.map((linea) => ({
    key: crypto.randomUUID(),
    CONCEPTO: linea.CONCEPTO,
    CANTIDAD: String(linea.CANTIDAD),
    PRECIO_UNITARIO: String(linea.PRECIO_UNITARIO),
    IVA_PORCENTAJE: String(linea.IVA_PORCENTAJE),
  }));
}

export function NuevaFacturaDialog({
  open,
  onClose,
  submitting,
  defaultCentroId,
  defaultAlumnoId,
  defaultCursoId,
  defaultMesPeriodo,
  defaultLineas,
  centros,
  cursos,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  submitting: boolean;
  defaultCentroId?: string | null;
  defaultAlumnoId?: string | null;
  defaultCursoId?: string | null;
  defaultMesPeriodo?: string | null;
  defaultLineas?: NuevaFacturaLineaPrefill[];
  centros: CentroData[];
  cursos: CursoEscolarData[];
  onSubmit: (input: CreateReciboBorradorInput) => void;
}) {
  const { tenantId, rol } = useActiveTenant();

  const [idCentro, setIdCentro] = useState(defaultCentroId ?? "");
  const [idCurso, setIdCurso] = useState("");
  const [idAlumno, setIdAlumno] = useState<string | null>(null);
  const [alumnoOpen, setAlumnoOpen] = useState(false);
  const [previewRef, setPreviewRef] = useState("");
  const [previewRefError, setPreviewRefError] = useState("");
  const [loadingRef, setLoadingRef] = useState(false);

  const [receptorNombre, setReceptorNombre] = useState("");
  const [cifDni, setCifDni] = useState("");
  const [mail, setMail] = useState("");
  const [tlf, setTlf] = useState("");
  const [calle, setCalle] = useState("");
  const [cp, setCp] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [provincia, setProvincia] = useState("");

  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [mesPeriodo, setMesPeriodo] = useState(resolveDefaultMesPeriodo);
  const [metodoPago, setMetodoPago] = useState("Transferencia");
  const [lineas, setLineas] = useState<LineaDraft[]>([newLineaDraft()]);

  const cursosFiltrados = useMemo(
    () => cursos.filter((c) => !idCentro || c.ID_CENTRO === idCentro),
    [cursos, idCentro],
  );

  const { data: alumnos = [], isLoading: loadingAlumnos } = useQuery({
    queryKey: ["facturas-alumnos-picker", tenantId, rol, idCentro],
    enabled: open && Boolean(idCentro.trim()),
    queryFn: async () => {
      let query = supabase
        .from("ALUMNOS")
        .select(
          "ID_ALUMNO, NOMBRE_ALUMNO, DNI, MAIL, TLF_COMUNICACION, DIRECCION, CP, MUNICIPIO, PROVINCIA, NOMBRE_PADRE, NOMBRE_MADRE",
        )
        .eq("ID_CENTRO", idCentro.trim())
        .order("NOMBRE_ALUMNO", { ascending: true });
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AlumnoPickerRow[];
    },
  });

  const alumnoSeleccionado = useMemo(
    () => alumnos.find((a) => a.ID_ALUMNO === idAlumno) ?? null,
    [alumnos, idAlumno],
  );

  const totalPreview = useMemo(() => {
    return lineas.reduce((acc, linea) => {
      const cantidad = Number(linea.CANTIDAD);
      const precio = Number(linea.PRECIO_UNITARIO);
      const iva = Number(linea.IVA_PORCENTAJE);
      if (
        !linea.CONCEPTO.trim() ||
        Number.isNaN(cantidad) ||
        Number.isNaN(precio) ||
        Number.isNaN(iva)
      ) {
        return acc;
      }
      return acc + calcVentaLineaSubtotal(cantidad, precio, iva);
    }, 0);
  }, [lineas]);

  useEffect(() => {
    if (!open) return;
    setIdCentro(defaultCentroId ?? "");
    setIdCurso(defaultCursoId ?? "");
    setIdAlumno(defaultAlumnoId?.trim() || null);
    setReceptorNombre("");
    setCifDni("");
    setMail("");
    setTlf("");
    setCalle("");
    setCp("");
    setMunicipio("");
    setProvincia("");
    setFecha(new Date().toISOString().slice(0, 10));
    setMesPeriodo(defaultMesPeriodo?.trim() || resolveDefaultMesPeriodo());
    setMetodoPago("Transferencia");
    setLineas(lineasFromPrefill(defaultLineas));
    setPreviewRef("");
    setPreviewRefError("");
  }, [open, defaultCentroId, defaultAlumnoId, defaultCursoId, defaultMesPeriodo, defaultLineas]);

  useEffect(() => {
    if (!open || !idCentro.trim() || !tenantId) {
      setPreviewRef("");
      setPreviewRefError("");
      return;
    }
    let cancelled = false;
    setLoadingRef(true);
    setPreviewRef("");
    setPreviewRefError("");
    previewNextRefRecibo(tenantId, idCentro)
      .then((ref) => {
        if (!cancelled) {
          setPreviewRef(ref);
          setPreviewRefError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "No se pudo calcular la referencia del recibo.";
          setPreviewRef("");
          setPreviewRefError(message);
          toast.error(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRef(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, idCentro, tenantId]);

  useEffect(() => {
    if (!alumnoSeleccionado) return;
    setReceptorNombre(resolveReceptorNombre(alumnoSeleccionado));
    setCifDni(alumnoSeleccionado.DNI?.trim() ?? "");
    setMail(alumnoSeleccionado.MAIL?.trim() ?? "");
    setTlf(alumnoSeleccionado.TLF_COMUNICACION?.trim() ?? "");
    setCalle(streetBeforePipe(alumnoSeleccionado.DIRECCION));
    setCp(alumnoSeleccionado.CP?.trim() ?? "");
    setMunicipio(alumnoSeleccionado.MUNICIPIO?.trim() ?? "");
    setProvincia(alumnoSeleccionado.PROVINCIA?.trim() ?? "");
  }, [alumnoSeleccionado]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!idCentro.trim()) {
      toast.error("Selecciona un centro.");
      return;
    }
    if (loadingRef) {
      toast.error("Espera a que se calcule la referencia.");
      return;
    }
    if (previewRefError || !previewRef.trim()) {
      toast.error(
        previewRefError ||
          "No se puede crear el recibo sin referencia. Configura REF_FACTURA en el centro.",
      );
      return;
    }
    if (!receptorNombre.trim()) {
      toast.error("El receptor es obligatorio.");
      return;
    }
    if (!cifDni.trim()) {
      toast.error("El CIF/DNI es obligatorio.");
      return;
    }
    if (!idAlumno) {
      if (!calle.trim() || !cp.trim() || !municipio.trim() || !provincia.trim()) {
        toast.error("Sin alumno, completa calle, CP, municipio y provincia.");
        return;
      }
    }

    const parsedLineas = lineas
      .map((linea) => ({
        CONCEPTO: linea.CONCEPTO.trim(),
        CANTIDAD: Number(linea.CANTIDAD),
        PRECIO_UNITARIO: Number(linea.PRECIO_UNITARIO),
        IVA_PORCENTAJE: Number(linea.IVA_PORCENTAJE),
      }))
      .filter((l) => l.CONCEPTO.length > 0);

    if (parsedLineas.length === 0) {
      toast.error("Añade al menos una línea con concepto.");
      return;
    }
    for (const linea of parsedLineas) {
      if (
        Number.isNaN(linea.CANTIDAD) ||
        linea.CANTIDAD <= 0 ||
        Number.isNaN(linea.PRECIO_UNITARIO) ||
        Number.isNaN(linea.IVA_PORCENTAJE)
      ) {
        toast.error("Revisa cantidad, precio e IVA de las líneas.");
        return;
      }
    }

    onSubmit({
      ID_CENTRO: idCentro.trim(),
      ID_CURSO: idCurso.trim() || null,
      ID_ALUMNO: idAlumno,
      RECEPTOR_NOMBRE: receptorNombre.trim(),
      CIF_DNI: cifDni.trim(),
      MAIL: mail.trim() || null,
      TLF: tlf.trim() || null,
      DIRECCION: packReciboDireccionJson({
        calle: calle.trim(),
        cp: cp.trim(),
        municipio: municipio.trim(),
        provincia: provincia.trim(),
      }),
      FECHA: fecha || null,
      MES_PERIODO: mesPeriodo.trim() || null,
      METODO_PAGO: normalizeMetodoPago(metodoPago) || metodoPago,
      TIPO_DOC: "Recibo",
      lineas: parsedLineas,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Emitir Nueva Factura</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Referencia (automática)</Label>
              <Input
                value={
                  loadingRef ? "Calculando…" : previewRefError ? previewRefError : previewRef || "—"
                }
                readOnly
                disabled
                className={cn(
                  "font-mono bg-muted",
                  previewRefError && "text-destructive border-destructive/50",
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo Doc</Label>
              <Input value="Recibo" readOnly disabled className="bg-muted" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Centro *</Label>
              <Select
                value={idCentro || undefined}
                onValueChange={(value) => {
                  setIdCentro(value);
                  setIdCurso("");
                  setIdAlumno(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar centro" />
                </SelectTrigger>
                <SelectContent>
                  {centros.map((centro) => (
                    <SelectItem key={centro.ID_CENTRO} value={centro.ID_CENTRO!}>
                      {centro.NOMBRE_CENTRO?.trim() || centro.ID_CENTRO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Curso escolar</Label>
              <Select value={idCurso || undefined} onValueChange={setIdCurso} disabled={!idCentro}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {cursosFiltrados.map((curso) => (
                    <SelectItem key={curso.ID_CURSO} value={curso.ID_CURSO}>
                      {curso.NOMBRE_CURSO?.trim() || curso.ID_CURSO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Alumno (opcional)</Label>
            <Popover open={alumnoOpen} onOpenChange={setAlumnoOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  disabled={!idCentro || loadingAlumnos}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {alumnoSeleccionado?.NOMBRE_ALUMNO?.trim() ||
                      (idCentro ? "Sin alumno vinculado" : "Selecciona centro primero")}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar alumno…" />
                  <CommandList>
                    <CommandEmpty>Sin alumnos en este centro.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__none__"
                        onSelect={() => {
                          setIdAlumno(null);
                          setReceptorNombre("");
                          setCifDni("");
                          setMail("");
                          setTlf("");
                          setCalle("");
                          setCp("");
                          setMunicipio("");
                          setProvincia("");
                          setAlumnoOpen(false);
                        }}
                      >
                        Sin alumno vinculado
                      </CommandItem>
                      {alumnos.map((alumno) => (
                        <CommandItem
                          key={alumno.ID_ALUMNO}
                          value={alumno.NOMBRE_ALUMNO?.trim() || alumno.ID_ALUMNO}
                          onSelect={() => {
                            setIdAlumno(alumno.ID_ALUMNO);
                            setAlumnoOpen(false);
                          }}
                        >
                          {alumno.NOMBRE_ALUMNO?.trim() || alumno.ID_ALUMNO}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Receptor *</Label>
              <Input
                value={receptorNombre}
                onChange={(e) => setReceptorNombre(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>CIF / DNI *</Label>
              <Input value={cifDni} onChange={(e) => setCifDni(e.target.value)} required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={mail} onChange={(e) => setMail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input value={tlf} onChange={(e) => setTlf(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Dirección (calle)</Label>
            <Input value={calle} onChange={(e) => setCalle(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>CP{idAlumno ? "" : " *"}</Label>
              <Input value={cp} onChange={(e) => setCp(e.target.value)} required={!idAlumno} />
            </div>
            <div className="space-y-2">
              <Label>Municipio{idAlumno ? "" : " *"}</Label>
              <Input
                value={municipio}
                onChange={(e) => setMunicipio(e.target.value)}
                required={!idAlumno}
              />
            </div>
            <div className="space-y-2">
              <Label>Provincia{idAlumno ? "" : " *"}</Label>
              <Input
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                required={!idAlumno}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Mes / periodo</Label>
              <Input value={mesPeriodo} onChange={(e) => setMesPeriodo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Método de pago</Label>
              <Select value={metodoPago} onValueChange={setMetodoPago}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METODOS_PAGO_FACTURA_MANUAL.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Líneas de venta *</Label>
              <Button
                type="button"
                size="sm"
                variant="brand-outline"
                className="h-8 gap-1"
                onClick={() => setLineas((prev) => [...prev, newLineaDraft()])}
              >
                <Plus className="h-3.5 w-3.5" />
                Añadir línea
              </Button>
            </div>
            {lineas.map((linea, index) => (
              <div
                key={linea.key}
                className="grid gap-2 rounded border bg-muted/20 p-2 sm:grid-cols-12"
              >
                <div className="sm:col-span-5 space-y-1">
                  <Label className="text-[10px]">Concepto</Label>
                  <Input
                    value={linea.CONCEPTO}
                    onChange={(e) =>
                      setLineas((prev) =>
                        prev.map((row) =>
                          row.key === linea.key ? { ...row, CONCEPTO: e.target.value } : row,
                        ),
                      )
                    }
                    placeholder="Concepto"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[10px]">Cant.</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={linea.CANTIDAD}
                    onChange={(e) =>
                      setLineas((prev) =>
                        prev.map((row) =>
                          row.key === linea.key ? { ...row, CANTIDAD: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[10px]">Precio €</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={linea.PRECIO_UNITARIO}
                    onChange={(e) =>
                      setLineas((prev) =>
                        prev.map((row) =>
                          row.key === linea.key ? { ...row, PRECIO_UNITARIO: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[10px]">IVA %</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={linea.IVA_PORCENTAJE}
                    onChange={(e) =>
                      setLineas((prev) =>
                        prev.map((row) =>
                          row.key === linea.key ? { ...row, IVA_PORCENTAJE: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-1 flex items-end justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    disabled={lineas.length <= 1}
                    onClick={() => setLineas((prev) => prev.filter((row) => row.key !== linea.key))}
                    aria-label={`Eliminar línea ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex justify-end text-sm font-semibold">
              Total estimado: {formatCurrency(totalPreview)}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="brand"
              disabled={submitting || loadingRef || !!previewRefError || !previewRef.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Guardar borrador"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
