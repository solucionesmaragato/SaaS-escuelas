import { useEffect, useMemo, useState } from "react";
import { ListChecks, Minus, MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import {
  useRubricas,
  formatSupabaseError,
  isRubricaEstadoValue,
  RUBRICA_ESTADO_VALUES,
  type RubricaData,
  type RubricaUpsertInput,
} from "@/hooks/useRubricas";
import { criterionNamesFromEstructura } from "@/lib/rubricStructure";
import { useActiveTenant } from "@/context/AppContext";
import { canWriteUi, hasPermission } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function RubricasAdminView() {
  const { rol } = useActiveTenant();
  const canRead = hasPermission(rol, "rubricas:read");
  const canMutate = canWriteUi(rol, "rubricas:write");
  const { list, upsert } = useRubricas();

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RubricaData | null>(null);

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.NOMBRE?.toLowerCase().includes(q) ||
        r.DESCRIPCION?.toLowerCase().includes(q) ||
        r.ESTADO?.toLowerCase().includes(q),
    );
  }, [list.data, query]);

  if (!canRead) {
    return (
      <div className="mx-auto max-w-4xl py-10 text-center">
        <PageHeader title="Gestor de Rúbricas" />
        <p className="mt-2 text-sm text-muted-foreground">
          No tienes permiso para acceder a esta sección.
        </p>
      </div>
    );
  }

  const handleSubmit = async (values: RubricaUpsertInput) => {
    try {
      await upsert.mutateAsync(values);
      toast.success(values.ID_RUBRICA ? "Rúbrica actualizada" : "Rúbrica creada");
      setCreating(false);
      setEditing(null);
    } catch (err) {
      console.error("RUBRICA UPSERT ERROR:", err);
      toast.error(formatSupabaseError(err));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Gestor de Rúbricas"
        description={`${list.data?.length ?? 0} rúbricas configuradas para esta escuela`}
        actions={
          canMutate && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nueva rúbrica
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, descripción o estado..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar rúbricas: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Estado</TableHead>
                {canMutate && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={canMutate ? 4 : 3}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canMutate ? 4 : 3}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {query ? "Sin resultados." : "Aún no hay rúbricas configuradas."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow
                    key={row.ID_RUBRICA}
                    className={
                      canMutate ? "cursor-pointer transition-colors hover:bg-muted/50" : undefined
                    }
                    onClick={canMutate ? () => setEditing(row) : undefined}
                  >
                    <TableCell className="font-medium">{row.NOMBRE}</TableCell>
                    <TableCell className="max-w-md truncate">{row.DESCRIPCION || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={row.ESTADO?.toLowerCase() === "activa" ? "default" : "secondary"}
                      >
                        {row.ESTADO || "—"}
                      </Badge>
                    </TableCell>
                    {canMutate && (
                      <TableCell onClick={(ev) => ev.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(row)}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {canMutate && (
        <RubricaFormDialog
          open={creating || Boolean(editing)}
          rubrica={editing}
          submitting={upsert.isPending}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function RubricaFormDialog({
  open,
  rubrica,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  rubrica: RubricaData | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: RubricaUpsertInput) => void;
}) {
  const isEdit = Boolean(rubrica);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [estado, setEstado] = useState<string>("Activa");
  const [criterios, setCriterios] = useState<string[]>([""]);

  useEffect(() => {
    if (!open) return;
    setNombre(rubrica?.NOMBRE ?? "");
    setDescripcion(rubrica?.DESCRIPCION ?? "");
    setEstado(rubrica?.ESTADO ?? "Activa");
    const names = rubrica ? criterionNamesFromEstructura(rubrica.ESTRUCTURA) : [];
    setCriterios(names.length > 0 ? names : [""]);
  }, [open, rubrica]);

  const updateCriterio = (index: number, value: string) => {
    setCriterios((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const addCriterio = () => {
    setCriterios((prev) => [...prev, ""]);
  };

  const removeCriterio = (index: number) => {
    setCriterios((prev) => {
      if (prev.length <= 1) return [""];
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (!isRubricaEstadoValue(estado)) {
      toast.error("Selecciona un estado válido");
      return;
    }

    const trimmedCriterios = criterios.map((c) => c.trim()).filter(Boolean);
    if (trimmedCriterios.length === 0) {
      toast.error("Añade al menos un criterio de evaluación");
      return;
    }

    onSubmit({
      ...(rubrica ? { ID_RUBRICA: rubrica.ID_RUBRICA } : {}),
      NOMBRE: nombre.trim(),
      DESCRIPCION: descripcion.trim() || null,
      ESTADO: estado,
      criterios: trimmedCriterios,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar rúbrica" : "Nueva rúbrica"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rubrica-nombre">Nombre *</Label>
            <Input
              id="rubrica-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Evaluación piano — nivel inicial"
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rubrica-descripcion">Descripción</Label>
            <Textarea
              id="rubrica-descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción breve de la rúbrica..."
              rows={3}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Estado *</Label>
            <Select value={estado} onValueChange={setEstado} disabled={submitting}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RUBRICA_ESTADO_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Criterios de evaluación *</Label>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCriterio}
                disabled={submitting}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Añadir
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Define los criterios que se evaluarán (p. ej. Ritmo, Técnica, Interpretación).
            </p>

            <div className="space-y-2">
              {criterios.map((criterio, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={criterio}
                    onChange={(e) => updateCriterio(index, e.target.value)}
                    placeholder={`Criterio ${index + 1}`}
                    disabled={submitting}
                    aria-label={`Criterio ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCriterio(index)}
                    disabled={submitting || criterios.length <= 1}
                    aria-label="Eliminar criterio"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !nombre.trim()}>
              {submitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear rúbrica"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
