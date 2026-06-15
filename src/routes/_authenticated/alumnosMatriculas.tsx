import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Mail,
  MessageCircle,
  Phone,
  Search,
  AlertTriangle,
  Pencil,
  SlidersHorizontal,
} from "lucide-react";
import { useAlumnosMatriculas } from "@/hooks/useAlumnosMatriculas";
import { useScrollChunk } from "@/hooks/useScrollChunk";
import { useActiveTenant } from "@/context/AppContext";
import { canWriteUi } from "@/lib/rbac";
import {
  formatPhoneForWhatsApp,
  isEstadoActivo,
  estadoFromToggle,
  sortAlphabetic,
  compareAlphabetic,
} from "@/lib/alumnosMatriculasUtils";
import { StudentDetailsModal } from "@/components/alumnos-matriculas/StudentDetailsModal";
import { EnrollmentDetailsModal } from "@/components/alumnos-matriculas/EnrollmentDetailsModal";
import type { Alumno } from "@/types/database";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/alumnosMatriculas")({
  component: AlumnosMatriculasPage,
});

type AlumnoRow = Alumno & { TOTAL_INCIDENCIAS: number };

type MatriculaRow = {
  ID_MATRICULA: string;
  ID_ALUMNO: string;
  ID_TARIFA: string | null;
  ESPECIALIDAD: string | null;
  ESTADO: string | null;
  FECHA_ALTA: string | null;
  FECHA_BAJA: string | null;
  ID_PROFESOR: string | null;
  TEXTO_ALUMNO: string;
  TEXTO_PROFESOR: string;
  TEXTO_TARIFA: string;
  TEXTO_ESPECIALIDAD: string;
  TOTAL_INCIDENCIAS: number;
};

function AlumnosMatriculasPage() {
  const { rol } = useActiveTenant();
  const canWriteAlumno = canWriteUi(rol, "alumnos:write");
  const canWriteMatricula = canWriteUi(rol, "matriculas:write");
  const { data, updateAlumno, updateMatricula } = useAlumnosMatriculas();

  const [studentQuery, setStudentQuery] = useState("");
  const [enrollmentQuery, setEnrollmentQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeMatricula, setActiveMatricula] = useState<MatriculaRow | null>(null);
  const [enrollmentModalOpen, setEnrollmentModalOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterEstado, setFilterEstado] = useState<"all" | "activo" | "inactivo">("all");
  const [filterTarifa, setFilterTarifa] = useState<string>("all");
  const [studentModal, setStudentModal] = useState<AlumnoRow | null>(null);

  const alumnos = useMemo(() => (data.data?.alumnos ?? []) as AlumnoRow[], [data.data?.alumnos]);
  const matriculas = useMemo(
    () => (data.data?.matriculas ?? []) as MatriculaRow[],
    [data.data?.matriculas],
  );

  const uniqueTarifas = useMemo(() => {
    const values = new Set<string>();
    for (const m of matriculas) {
      const tarifa = m.TEXTO_TARIFA?.trim();
      if (tarifa) values.add(tarifa);
    }
    return [...values].sort(compareAlphabetic);
  }, [matriculas]);

  const filteredAlumnos = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    const rows = q
      ? alumnos.filter(
          (a) =>
            a.NOMBRE_ALUMNO?.toLowerCase().includes(q) ||
            a.NOMBRE_MADRE?.toLowerCase().includes(q) ||
            a.MAIL?.toLowerCase().includes(q) ||
            a.TLF_COMUNICACION?.toLowerCase().includes(q),
        )
      : alumnos;
    return sortAlphabetic(rows, (a) => a.NOMBRE_ALUMNO ?? "");
  }, [alumnos, studentQuery]);

  const filteredMatriculas = useMemo(() => {
    let rows = matriculas;

    if (filterEstado === "activo") {
      rows = rows.filter((m) => isEstadoActivo(m.ESTADO));
    } else if (filterEstado === "inactivo") {
      rows = rows.filter((m) => !isEstadoActivo(m.ESTADO));
    }
    if (filterTarifa !== "all") {
      rows = rows.filter((m) => m.TEXTO_TARIFA === filterTarifa);
    }
    if (enrollmentQuery.trim()) {
      const q = enrollmentQuery.toLowerCase();
      rows = rows.filter(
        (m) =>
          m.TEXTO_ALUMNO?.toLowerCase().includes(q) ||
          m.TEXTO_TARIFA?.toLowerCase().includes(q) ||
          m.TEXTO_ESPECIALIDAD?.toLowerCase().includes(q) ||
          m.TEXTO_PROFESOR?.toLowerCase().includes(q) ||
          m.ESTADO?.toLowerCase().includes(q),
      );
    }

    return sortAlphabetic(rows, (m) => m.TEXTO_ALUMNO ?? "");
  }, [matriculas, enrollmentQuery, filterEstado, filterTarifa]);

  const hasActiveEnrollmentFilters = filterEstado !== "all" || filterTarifa !== "all";

  const {
    slice: visibleAlumnos,
    onScroll: onStudentsScroll,
    hasMore: hasMoreStudents,
  } = useScrollChunk(filteredAlumnos);

  const {
    slice: visibleMatriculas,
    onScroll: onEnrollmentsScroll,
    hasMore: hasMoreEnrollments,
  } = useScrollChunk(filteredMatriculas);

  useEffect(() => {
    if (filteredAlumnos.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredAlumnos.some((a) => a.ID_ALUMNO === selectedId)) {
      setSelectedId(filteredAlumnos[0].ID_ALUMNO);
    }
  }, [filteredAlumnos, selectedId]);

  const openEnrollmentEditor = (mat: MatriculaRow) => {
    setActiveMatricula(mat);
    setEnrollmentModalOpen(true);
  };

  const handleEditEnrollment = () => {
    if (!activeMatricula) {
      toast.info("Selecciona una matrícula de la tabla para editarla");
      return;
    }
    setEnrollmentModalOpen(true);
  };

  const handleMatriculaEstado = async (mat: MatriculaRow, checked: boolean) => {
    const val = estadoFromToggle(checked);
    try {
      await updateMatricula.mutateAsync({ id: mat.ID_MATRICULA, patch: { ESTADO: val } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar matrícula");
    }
  };

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      <div className="border-b bg-background px-4 py-3">
        <h1 className="text-xl font-semibold tracking-tight">Alumnos y matrículas</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona alumnos y todas las matrículas del centro
        </p>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Students — 1/3 */}
        <section className="flex w-1/3 min-w-0 flex-col border-r bg-background">
          <div className={PANEL_SEARCH_ROW_CLASS}>
            <PanelSearchInput
              placeholder="Buscar alumno..."
              value={studentQuery}
              onChange={setStudentQuery}
            />
          </div>

          <div className="overflow-y-auto" onScroll={onStudentsScroll}>
            {data.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : data.isError ? (
              <div className="p-4 text-sm text-destructive">
                Error al cargar: {(data.error as Error)?.message}
              </div>
            ) : visibleAlumnos.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {studentQuery ? "Sin resultados." : "No hay alumnos."}
              </div>
            ) : (
              <ul className="divide-y">
                {visibleAlumnos.map((alumno) => (
                  <li key={alumno.ID_ALUMNO}>
                    <StudentCard
                      alumno={alumno}
                      selected={selectedId === alumno.ID_ALUMNO}
                      onSelect={() => setSelectedId(alumno.ID_ALUMNO)}
                      onOpenDetails={() => setStudentModal(alumno)}
                    />
                  </li>
                ))}
                {hasMoreStudents && (
                  <li className="p-3 text-center text-xs text-muted-foreground">
                    Desplázate para cargar más…
                  </li>
                )}
              </ul>
            )}
          </div>
        </section>

        {/* Enrollments — 2/3 */}
        <section className="flex w-2/3 min-w-0 flex-col bg-muted/20">
          <div className={cn(PANEL_SEARCH_ROW_CLASS, "flex items-center gap-2")}>
            <PanelSearchInput
              placeholder="Buscar por alumno, tarifa, especialidad, profesor o estado..."
              value={enrollmentQuery}
              onChange={setEnrollmentQuery}
            />
            <Label
              htmlFor="filtro-especialidad-tarifa"
              className="shrink-0 text-sm font-medium"
            >
              Especialidad
            </Label>
            <Select value={filterTarifa} onValueChange={setFilterTarifa}>
              <SelectTrigger id="filtro-especialidad-tarifa" className="h-9 w-44 shrink-0 sm:w-52">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {uniqueTarifas.map((tarifa) => (
                  <SelectItem key={tarifa} value={tarifa}>
                    {tarifa}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2.5">
            <div>
              <h2 className="font-medium leading-none">Matrículas</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {filteredMatriculas.length} de {matriculas.length} matrículas
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditEnrollment}
                disabled={!activeMatricula}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Button>
              <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant={hasActiveEnrollmentFilters ? "default" : "outline"}
                    size="sm"
                  >
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Filtrar
                    {hasActiveEnrollmentFilters && (
                      <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                        ON
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="end">
                  <div className="space-y-4">
                    <p className="text-sm font-medium">Filtros de matrículas</p>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Estado</Label>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            ["all", "Todos"],
                            ["activo", "Activos"],
                            ["inactivo", "Inactivos"],
                          ] as const
                        ).map(([value, label]) => (
                          <Button
                            key={value}
                            type="button"
                            size="sm"
                            variant={filterEstado === value ? "default" : "outline"}
                            onClick={() => setFilterEstado(value)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setFilterEstado("all");
                        setFilterTarifa("all");
                      }}
                    >
                      Limpiar filtros
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="overflow-y-auto" onScroll={onEnrollmentsScroll}>
            {data.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : matriculas.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                No hay matrículas registradas
              </div>
            ) : visibleMatriculas.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                {enrollmentQuery || hasActiveEnrollmentFilters || filterTarifa !== "all"
                  ? "Sin resultados para tu búsqueda o filtros."
                  : "No hay matrículas."}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre alumno</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Tarifa</TableHead>
                      <TableHead className="text-center">Incidencias</TableHead>
                      <TableHead>Especialidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleMatriculas.map((mat) => {
                      const active = isEstadoActivo(mat.ESTADO);
                      const isSelected = activeMatricula?.ID_MATRICULA === mat.ID_MATRICULA;
                      return (
                        <TableRow
                          key={mat.ID_MATRICULA}
                          className={cn(
                            "cursor-pointer hover:bg-muted/50",
                            isSelected && "bg-primary/5",
                          )}
                          onClick={() => openEnrollmentEditor(mat)}
                        >
                          <TableCell className="font-medium">{mat.TEXTO_ALUMNO}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={active}
                                disabled={!canWriteMatricula}
                                className={cn(
                                  active
                                    ? "data-[state=checked]:bg-green-600"
                                    : "data-[state=unchecked]:bg-red-500",
                                )}
                                onCheckedChange={(checked) => handleMatriculaEstado(mat, checked)}
                              />
                              <span
                                className={cn(
                                  "text-xs font-medium",
                                  active ? "text-green-700" : "text-red-600",
                                )}
                              >
                                {active ? "Activo" : "Inactivo"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>{mat.TEXTO_TARIFA}</TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={mat.TOTAL_INCIDENCIAS > 0 ? "destructive" : "secondary"}
                              className="gap-1"
                            >
                              {mat.TOTAL_INCIDENCIAS > 0 && (
                                <AlertTriangle className="h-3 w-3" />
                              )}
                              {mat.TOTAL_INCIDENCIAS}
                            </Badge>
                          </TableCell>
                          <TableCell>{mat.TEXTO_ESPECIALIDAD}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {hasMoreEnrollments && (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    Desplázate para cargar más…
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      <StudentDetailsModal
        alumno={studentModal}
        open={!!studentModal}
        onClose={() => setStudentModal(null)}
        canWrite={canWriteAlumno}
        onPatch={async (patch) => {
          if (!studentModal) return;
          await updateAlumno.mutateAsync({ id: studentModal.ID_ALUMNO, patch });
        }}
      />

      <EnrollmentDetailsModal
        matricula={activeMatricula}
        open={enrollmentModalOpen}
        onClose={() => setEnrollmentModalOpen(false)}
      />
    </div>
  );
}

const PANEL_SEARCH_ROW_CLASS = "shrink-0 border-b bg-background p-3";

function PanelSearchInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 pl-9"
      />
    </div>
  );
}

function StudentCard({
  alumno,
  selected,
  onSelect,
  onOpenDetails,
}: {
  alumno: AlumnoRow;
  selected: boolean;
  onSelect: () => void;
  onOpenDetails: () => void;
}) {
  const waPhone = formatPhoneForWhatsApp(alumno.TLF_COMUNICACION);

  return (
    <article
      className={cn(
        "flex cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-muted/50",
        selected && "bg-primary/5 ring-1 ring-inset ring-primary/20",
      )}
      onClick={() => {
        onSelect();
        onOpenDetails();
      }}
    >
      <PersonAvatar
        name={alumno.NOMBRE_ALUMNO}
        photoUrl={alumno.FOTO}
        className="h-12 w-12"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold leading-tight">{alumno.NOMBRE_ALUMNO}</p>
        <p className="truncate text-sm text-muted-foreground">
          Tutor legal A: {alumno.NOMBRE_MADRE ?? "—"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {waPhone ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" asChild>
            <a
              href={`https://web.whatsapp.com/send?phone=${waPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled aria-label="WhatsApp">
            <MessageCircle className="h-4 w-4" />
          </Button>
        )}
        {alumno.TLF_COMUNICACION ? (
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <a href={`tel:${alumno.TLF_COMUNICACION}`} aria-label="Llamar">
              <Phone className="h-4 w-4" />
            </a>
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled aria-label="Llamar">
            <Phone className="h-4 w-4" />
          </Button>
        )}
        {alumno.MAIL ? (
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <a href={`mailto:${alumno.MAIL}`} aria-label="Email">
              <Mail className="h-4 w-4" />
            </a>
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled aria-label="Email">
            <Mail className="h-4 w-4" />
          </Button>
        )}
      </div>
    </article>
  );
}
