import { useMemo, useState, type ReactNode } from "react";
import { MoreHorizontal, Plus, Search, Trash2, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export interface CrudColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface Props<T> {
  title: string;
  subtitle?: string;
  rows: T[] | undefined;
  loading: boolean;
  error?: unknown;
  columns: CrudColumn<T>[];
  rowKey: (row: T) => string;
  searchFn?: (row: T, q: string) => boolean;
  canWrite: boolean;
  onCreate?: () => void;
  onEdit?: (row: T) => void;
  onView?: (row: T) => void;
  onDelete?: (row: T) => Promise<void>;
  emptyLabel?: string;
  pageSize?: number;
}

export function CrudTable<T>({
  title, subtitle, rows, loading, error, columns, rowKey, searchFn,
  canWrite, onCreate, onEdit, onView, onDelete,
  emptyLabel = "Sin datos.", pageSize = 10,
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [removing, setRemoving] = useState(false);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    if (!query.trim() || !searchFn) return list;
    const q = query.toLowerCase();
    return list.filter((r) => searchFn(r, q));
  }, [rows, query, searchFn]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const hasActions = !!(onView || onEdit || onDelete);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {rows?.length ?? 0} en total{subtitle ? ` · ${subtitle}` : ""}
          </p>
        </div>
        {canWrite && onCreate && (
          <Button onClick={onCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo
          </Button>
        )}
      </div>

      <Card className="p-4">
        {searchFn && (
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
        )}

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error: {(error as Error)?.message}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c, i) => (
                  <TableHead key={i} className={c.className}>{c.header}</TableHead>
                ))}
                {hasActions && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={columns.length + (hasActions ? 1 : 0)}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + (hasActions ? 1 : 0)} className="py-10 text-center text-muted-foreground">
                    {query ? "Sin resultados." : emptyLabel}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => (
                  <TableRow key={rowKey(row)}>
                    {columns.map((c, i) => (
                      <TableCell key={i} className={c.className}>{c.cell(row)}</TableCell>
                    ))}
                    {hasActions && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {onView && (
                              <DropdownMenuItem onClick={() => onView(row)}>
                                <Eye className="mr-2 h-4 w-4" /> Ver
                              </DropdownMenuItem>
                            )}
                            {canWrite && onEdit && (
                              <DropdownMenuItem onClick={() => onEdit(row)}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar
                              </DropdownMenuItem>
                            )}
                            {canWrite && onDelete && (
                              <DropdownMenuItem
                                onClick={() => setDeleting(row)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                              </DropdownMenuItem>
                            )}
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

        {filtered.length > pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <div className="text-muted-foreground">Página {page} de {totalPages}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </Card>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!deleting || !onDelete) return;
                setRemoving(true);
                try {
                  await onDelete(deleting);
                  toast.success("Registro eliminado");
                  setDeleting(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Error al eliminar");
                } finally {
                  setRemoving(false);
                }
              }}
            >Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
