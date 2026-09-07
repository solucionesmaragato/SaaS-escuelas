import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  FileCode,
  FileSpreadsheet,
  FileArchive,
  Calendar,
  HelpCircle,
  Loader2,
  AlertCircle,
  Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useRemesas,
  buildGenerarRemesaRpcPayload,
  assertGenerarRemesaRpcPayload,
  buildEnviarRemesaRpcPayloadFromRow,
  fetchIncompleteRemesaBankingNames,
  formatRemesaBankingValidationMessage,
  validateRemesaLoteBeforeEnviar,
  invokeGenerarXmlSepaRemesa,
  fetchSepaBorradorRecibosForEnviar,
  fetchDuplicatePaymentConflicts,
  emitKorefactuForRemesaRecibos,
  invokeGenerarZipRecibosRemesa,
  VERIFACTU_EXITO_TOAST,
  encolarRemesaPostProceso,
  invokeProcesarRemesaJob,
  resumePendingRemesaJobs,
  remesaGeneracionJobsQueryKey,
  fetchActiveRemesaGeneracionJobs,
  registrarAvisoRemesaXmlFallido,
  type ControlRemesaRow,
  type ControlRemesaUpdatePatch,
} from "@/hooks/useRemesas";
import { invokeGenerarExcelRemesaControl } from "@/hooks/useVentasLineas";
import { useCentros, type CentroData, type CursoEscolarData } from "@/hooks/useCentros";
import { useActiveTenant, useApp } from "@/context/AppContext";
import type { WorkspaceOption } from "@/lib/workspaceProfiles";
import { canWriteUi, hasPermission } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { MESES_ANIO } from "@/lib/alumnosMatriculasUtils";
import { isAdminRole, isMasterRole, tenantListKey } from "@/lib/tenantQuery";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/StatusBadge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type RemesasSearch = {
  remesaId?: string;
};

export const Route = createFileRoute("/_authenticated/remesas")({
  validateSearch: (search: Record<string, unknown>): RemesasSearch => {
    const remesaId = search.remesaId;
    return typeof remesaId === "string" && remesaId.trim() ? { remesaId: remesaId.trim() } : {};
  },
  component: RemesasPage,
});

const PAGE_SIZE = 10;
const sortLocale = { sensitivity: "base" } as const;

function parseCalendarDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildSchoolYearMonthOptions(curso: CursoEscolarData | null): string[] {
  if (!curso?.FECHA_INICIO || !curso?.FECHA_FIN) return [];
  const start = parseCalendarDate(curso.FECHA_INICIO);
  const end = parseCalendarDate(curso.FECHA_FIN);
  if (!start || !end) return [];

  const options: string[] = [];
  const current = startOfMonth(start);
  const lastMonth = startOfMonth(end);

  while (current <= lastMonth) {
    options.push(`${MESES_ANIO[current.getMonth()]} ${current.getFullYear()}`);
    current.setMonth(current.getMonth() + 1);
  }

  return options;
}

function currentMonthPeriodLabel(referenceDate = new Date()): string {
  return `${MESES_ANIO[referenceDate.getMonth()]} ${referenceDate.getFullYear()}`;
}

function mergeTenantCentros(
  centros: CentroData[],
  workspaceOptions: WorkspaceOption[],
  tenantId: string,
): CentroData[] {
  const map = new Map<string, CentroData>();
  for (const centro of centros) {
    map.set(centro.ID_CENTRO, centro);
  }
  for (const option of workspaceOptions) {
    if (option.perfil.ID_CLIENTE !== tenantId) continue;
    const wsCentro = option.centro;
    if (!wsCentro?.ID_CENTRO || map.has(wsCentro.ID_CENTRO)) continue;
    map.set(wsCentro.ID_CENTRO, {
      ID_CENTRO: wsCentro.ID_CENTRO,
      ID_CLIENTE: tenantId,
      NOMBRE_CENTRO: wsCentro.NOMBRE_CENTRO,
      DIRECCION: null,
      TELEFONO_CENTRO: null,
      EMAIL_CENTRO: null,
      ESTADO: null,
      REF_FACTURA: null,
      VAPI_ASSISTANT_ID: null,
      VAPI_PHONE_NUMBER: null,
      CURSO_ESCOLAR: [],
    });
  }
  return [...map.values()].sort((a, b) =>
    a.NOMBRE_CENTRO.localeCompare(b.NOMBRE_CENTRO, "es", sortLocale),
  );
}

function collectErrorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    return [record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === "string")
      .join(" ");
  }
  return String(err);
}

function isRestrictVetoError(err: unknown): boolean {
  return collectErrorText(err).includes("RESTRICT_VETO");
}

function isRemesaGenerada(estado: string | null | undefined): boolean {
  return estado?.trim().toLowerCase() === "generada";
}

function isRemesaExcelDownloadable(estado: string | null | undefined): boolean {
  const normalized = estado?.trim().toLowerCase();
  return normalized === "generada" || normalized === "enviada";
}

type RemesaEstado = "Generada" | "Enviada";

function normalizeRemesaEstado(estado: string | null | undefined): RemesaEstado {
  return estado?.trim().toLowerCase() === "enviada" ? "Enviada" : "Generada";
}

function remesaEstadoStatus(estado: RemesaEstado): StatusBadgeVariant {
  return estado === "Enviada" ? "success" : "info";
}

async function handleDownloadXML(link: string) {
  if (!link.trim()) {
    toast.error("No hay XML SEPA vinculado a esta remesa.");
    return;
  }

  try {
    const response = await fetch(link);
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = link.split("/").pop()?.split("?")[0] ?? "remesa_sepa.xml";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success("XML SEPA descargado correctamente.");
  } catch (error) {
    console.error("Error al descargar XML SEPA:", error);
    toast.error("No se pudo descargar el XML SEPA. Comprueba el enlace o los permisos.");
  }
}

function RemesaVaultIconButton({
  available,
  label,
  icon: Icon,
  onClick,
  href,
  loading = false,
}: {
  available: boolean;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
  loading?: boolean;
}) {
  const buttonClass = cn(
    "h-8 w-8 rounded-md border shadow-sm transition-colors",
    available
      ? "border-border/80 bg-background text-slate-700 hover:border-primary/30 hover:bg-muted hover:text-slate-900"
      : "border-transparent bg-muted/30 text-muted-foreground/35 cursor-not-allowed",
  );

  if (available && href && !loading) {
    return (
      <Button variant="ghost" size="icon" className={buttonClass} asChild title={label}>
        <a href={href} target="_blank" rel="noreferrer" aria-label={label}>
          <Icon className="h-4 w-4" />
        </a>
      </Button>
    );
  }

  if (available && onClick) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={buttonClass}
        onClick={onClick}
        title={label}
        aria-label={label}
        disabled={loading}
      >
        <Icon className={cn("h-4 w-4", loading && "animate-spin")} />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={buttonClass}
      disabled
      tabIndex={-1}
      aria-label={`${label} no disponible`}
      title={`${label} no disponible`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

async function executeGenerarRemesaSubmit({
  id_cliente,
  id_centro,
  id_curso,
  mes_periodo,
  onSubmit,
}: {
  id_cliente: string;
  id_centro: string;
  id_curso: string;
  mes_periodo: string;
  onSubmit: (payload: {
    p_id_cliente: string;
    p_id_centro: string;
    p_id_curso: string;
    p_mes_periodo: string;
  }) => Promise<void>;
}): Promise<void> {
  const payload = buildGenerarRemesaRpcPayload({
    id_cliente,
    id_centro,
    id_curso,
    mes_periodo,
  });

  assertGenerarRemesaRpcPayload(payload);

  await onSubmit(payload);
}

function RemesasPage() {
  const { remesaId } = Route.useSearch();
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const canWrite = canWriteUi(rol, "remesas:write");
  const { list, update, remove, generarRemesaMensual, enviarRemesaBloque } = useRemesas();
  const centros = useCentros();

  const centroNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const centro of centros.list.data ?? []) {
      if (centro.ID_CENTRO) {
        map.set(centro.ID_CENTRO, centro.NOMBRE_CENTRO?.trim() || centro.ID_CENTRO);
      }
    }
    return map;
  }, [centros.list.data]);

  const cursoNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const centro of centros.list.data ?? []) {
      for (const curso of centro.CURSO_ESCOLAR ?? []) {
        if (curso.ID_CURSO) {
          map.set(curso.ID_CURSO, curso.NOMBRE_CURSO?.trim() || curso.ID_CURSO);
        }
      }
    }
    return map;
  }, [centros.list.data]);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ControlRemesaRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [generatingRemesa, setGeneratingRemesa] = useState(false);
  const [deleting, setDeleting] = useState<ControlRemesaRow | null>(null);
  const [sendingRemesaId, setSendingRemesaId] = useState<string | null>(null);
  const [validatingRemesaId, setValidatingRemesaId] = useState<string | null>(null);
  const [confirmEnviarRemesa, setConfirmEnviarRemesa] = useState<{
    ID_REMESA: string;
    ID_CLIENTE?: string | null;
    ID_CENTRO?: string | null;
    ID_CURSO?: string | null;
    MES_PERIODO?: string | null;
    ESTADO?: string | null;
  } | null>(null);
  const [duplicatePaymentPrompt, setDuplicatePaymentPrompt] = useState<{
    alumnoNombre: string;
  } | null>(null);
  const [generatingZipRemesaId, setGeneratingZipRemesaId] = useState<string | null>(null);
  const [generatingExcelRemesaId, setGeneratingExcelRemesaId] = useState<string | null>(null);
  const duplicatePaymentPromptResolverRef = useRef<((include: boolean) => void) | null>(null);
  const resumedJobsRef = useRef(false);
  const prevActiveRemesaJobsCountRef = useRef<number | null>(null);

  const activeRemesaJobsQuery = useQuery({
    queryKey: remesaGeneracionJobsQueryKey(tenantId, rol),
    queryFn: () => fetchActiveRemesaGeneracionJobs(tenantId, rol),
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 5000 : false),
  });

  const activeRemesaJobsCount = activeRemesaJobsQuery.data?.length ?? 0;

  useEffect(() => {
    const prev = prevActiveRemesaJobsCountRef.current;
    prevActiveRemesaJobsCountRef.current = activeRemesaJobsCount;

    if (prev !== null && activeRemesaJobsCount < prev) {
      void qc.invalidateQueries({ queryKey: tenantListKey("avisos-internos", rol, tenantId) });
    }
  }, [activeRemesaJobsCount, qc, rol, tenantId]);

  useEffect(() => {
    if (!canWrite || resumedJobsRef.current) return;
    resumedJobsRef.current = true;
    void resumePendingRemesaJobs(tenantId, rol).then(() => {
      void qc.invalidateQueries({ queryKey: remesaGeneracionJobsQueryKey(tenantId, rol) });
    });
  }, [canWrite, tenantId, rol, qc]);

  const promptDuplicatePaymentInclusion = (alumnoNombre: string) =>
    new Promise<boolean>((resolve) => {
      duplicatePaymentPromptResolverRef.current = resolve;
      setDuplicatePaymentPrompt({ alumnoNombre });
    });

  const resolveDuplicatePaymentPrompt = (include: boolean) => {
    duplicatePaymentPromptResolverRef.current?.(include);
    duplicatePaymentPromptResolverRef.current = null;
    setDuplicatePaymentPrompt(null);
  };

  const toastMissingZipAlumnos = (missingAlumnos: string[]) => {
    if (missingAlumnos.length === 0) return;
    toast.warning(`Faltan facturas de ${missingAlumnos.join(", ")}`);
  };

  const handleDownloadExcelRemesa = async (row: {
    ID_REMESA: string;
    ID_CLIENTE?: string | null;
    ID_CENTRO?: string | null;
    ID_CURSO?: string | null;
    MES_PERIODO?: string | null;
  }) => {
    const payload = assertGenerarRemesaRpcPayload(buildEnviarRemesaRpcPayloadFromRow(row));
    setGeneratingExcelRemesaId(row.ID_REMESA);
    try {
      const link = await invokeGenerarExcelRemesaControl({
        id_cliente: payload.p_id_cliente,
        id_centro: payload.p_id_centro,
        id_curso: payload.p_id_curso,
        mes_periodo: payload.p_mes_periodo,
      });
      window.open(link, "_blank", "noopener,noreferrer");
      await qc.invalidateQueries({ queryKey: tenantListKey("remesas", rol, tenantId) });
      toast.success("Excel contable generado.");
    } catch (err) {
      toast.error(collectErrorText(err) || "Error al generar el Excel contable.");
    } finally {
      setGeneratingExcelRemesaId(null);
    }
  };

  const handleDownloadZipRemesa = async (row: {
    ID_REMESA: string;
    ID_CLIENTE?: string | null;
    ID_CENTRO?: string | null;
    ID_CURSO?: string | null;
    MES_PERIODO?: string | null;
  }) => {
    const payload = assertGenerarRemesaRpcPayload(buildEnviarRemesaRpcPayloadFromRow(row));
    setGeneratingZipRemesaId(row.ID_REMESA);
    try {
      const zipResult = await invokeGenerarZipRecibosRemesa(payload);
      if (!zipResult.link) {
        if (zipResult.missingAlumnos.length > 0) {
          toastMissingZipAlumnos(zipResult.missingAlumnos);
        } else {
          toast.info("No hay PDF oficiales guardados en este lote para empaquetar.");
        }
        return;
      }
      window.open(zipResult.link, "_blank", "noopener,noreferrer");
      await qc.invalidateQueries({ queryKey: tenantListKey("remesas", rol, tenantId) });
      toastMissingZipAlumnos(zipResult.missingAlumnos);
      toast.success(
        zipResult.pdfCount === 1
          ? "ZIP generado con 1 factura oficial."
          : `ZIP generado con ${zipResult.pdfCount} facturas oficiales.`,
      );
    } catch (err) {
      toast.error(collectErrorText(err) || "Error al generar el ZIP de facturas.");
    } finally {
      setGeneratingZipRemesaId(null);
    }
  };

  const executeEnviarRemesa = async (
    row: {
      ID_REMESA: string;
      ID_CLIENTE?: string | null;
      ID_CENTRO?: string | null;
      ID_CURSO?: string | null;
      MES_PERIODO?: string | null;
      ESTADO?: string | null;
    },
    includedReciboIds: string[],
  ) => {
    if (!isRemesaGenerada(row.ESTADO)) return;

    const payload = assertGenerarRemesaRpcPayload(buildEnviarRemesaRpcPayloadFromRow(row));
    setSendingRemesaId(row.ID_REMESA);

    try {
      if (includedReciboIds.length === 0) {
        toast.warning("No hay recibos SEPA incluidos en el envío.");
        return;
      }

      let xmlLink: string | null = null;
      try {
        xmlLink = await invokeGenerarXmlSepaRemesa(payload, includedReciboIds);
      } catch (xmlErr) {
        const xmlErrorText = collectErrorText(xmlErr) || "Error al generar el XML SEPA.";
        try {
          await registrarAvisoRemesaXmlFallido(payload, xmlErrorText);
          void qc.invalidateQueries({ queryKey: tenantListKey("avisos-internos", rol, tenantId) });
        } catch (avisoErr) {
          console.error("[executeEnviarRemesa] aviso XML fallido:", avisoErr);
        }
        toast.error(`${xmlErrorText} La remesa sigue Generada.`);
        return;
      }

      if (!xmlLink) {
        try {
          await registrarAvisoRemesaXmlFallido(payload, "No se pudo generar el XML SEPA.");
          void qc.invalidateQueries({ queryKey: tenantListKey("avisos-internos", rol, tenantId) });
        } catch (avisoErr) {
          console.error("[executeEnviarRemesa] aviso XML fallido:", avisoErr);
        }
        toast.error("No se pudo generar el XML SEPA. La remesa sigue Generada.");
        return;
      }

      void qc.invalidateQueries({ queryKey: tenantListKey("avisos-internos", rol, tenantId) });

      const { cobradosConUuid, failures, excelErrors } =
        await emitKorefactuForRemesaRecibos(includedReciboIds);

      for (const failure of failures) {
        toast.error(failure.message);
      }

      if (cobradosConUuid.length === 0) {
        toast.error("Ningún recibo pudo emitirse con Verifactu. La remesa sigue Generada.");
        return;
      }

      if (failures.length > 0) {
        toast.warning(
          `${failures.length} recibo(s) no se emitieron con Verifactu y no pasarán a Cobrado.`,
        );
      }

      for (const excelError of excelErrors) {
        toast.warning(excelError);
      }

      await enviarRemesaBloque.mutateAsync({ ...payload, p_id_recibos: cobradosConUuid });

      try {
        const zipResult = await invokeGenerarZipRecibosRemesa(payload);
        if (zipResult.link) {
          void qc.invalidateQueries({ queryKey: tenantListKey("remesas", rol, tenantId) });
        }
        toastMissingZipAlumnos(zipResult.missingAlumnos);
      } catch (zipErr) {
        toast.error(collectErrorText(zipErr) || "Error al generar el ZIP de facturas.");
      }

      if (failures.length === 0) {
        toast.success(VERIFACTU_EXITO_TOAST);
      } else {
        toast.success(
          `Remesa enviada. ${cobradosConUuid.length} recibo(s) Cobrados con factura Verifactu.`,
        );
      }
    } catch (err) {
      toast.error(collectErrorText(err) || "Error al enviar la remesa al banco");
    } finally {
      setSendingRemesaId(null);
    }
  };

  const requestEnviarRemesa = async (row: {
    ID_REMESA: string;
    ID_CLIENTE?: string | null;
    ID_CENTRO?: string | null;
    ID_CURSO?: string | null;
    MES_PERIODO?: string | null;
    ESTADO?: string | null;
  }) => {
    if (!isRemesaGenerada(row.ESTADO)) return;

    setValidatingRemesaId(row.ID_REMESA);
    try {
      const [incompleteNames, loteErrors] = await Promise.all([
        fetchIncompleteRemesaBankingNames(tenantId, rol, row),
        validateRemesaLoteBeforeEnviar(tenantId, rol, row),
      ]);

      const validationMessages: string[] = [];
      if (incompleteNames.length > 0) {
        validationMessages.push(formatRemesaBankingValidationMessage(incompleteNames));
      }
      validationMessages.push(...loteErrors);

      if (validationMessages.length > 0) {
        toast.error(validationMessages.join("\n\n"));
        return;
      }
      setConfirmEnviarRemesa(row);
    } catch (err) {
      toast.error(collectErrorText(err) || "Error al validar la remesa antes del envío");
    } finally {
      setValidatingRemesaId(null);
    }
  };

  const handleConfirmEnviarRemesa = async () => {
    if (!confirmEnviarRemesa || sendingRemesaId) return;
    const row = confirmEnviarRemesa;
    setConfirmEnviarRemesa(null);

    try {
      const sepaRecibos = await fetchSepaBorradorRecibosForEnviar(tenantId, rol, row);
      const conflicts = await fetchDuplicatePaymentConflicts(tenantId, rol, row, sepaRecibos);
      const includedIds = new Set(sepaRecibos.map((recibo) => recibo.ID_RECIBO));

      for (const conflict of conflicts) {
        const include = await promptDuplicatePaymentInclusion(conflict.alumnoNombre);
        if (!include) {
          includedIds.delete(conflict.ID_RECIBO);
        }
      }

      await executeEnviarRemesa(row, [...includedIds]);
    } catch (err) {
      toast.error(collectErrorText(err) || "Error al preparar el envío de la remesa");
    }
  };

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r: ControlRemesaRow) =>
        r.MES_PERIODO?.toLowerCase().includes(q) ||
        r.ESTADO?.toLowerCase().includes(q) ||
        r.ID_REMESA?.toLowerCase().includes(q) ||
        centroNameById
          .get(r.ID_CENTRO ?? "")
          ?.toLowerCase()
          .includes(q) ||
        cursoNameById
          .get(r.ID_CURSO ?? "")
          ?.toLowerCase()
          .includes(q),
    );
  }, [list.data, query, centroNameById, cursoNameById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (!remesaId || list.isLoading) return;
    const rows = list.data ?? [];
    const index = rows.findIndex(
      (row: { ID_REMESA?: string | null }) => row.ID_REMESA === remesaId,
    );
    if (index < 0) return;
    setQuery("");
    const targetPage = Math.floor(index / PAGE_SIZE) + 1;
    if (targetPage !== page) {
      setPage(targetPage);
    }
  }, [remesaId, list.data, list.isLoading, page]);

  if (!hasPermission(rol, "remesas:write")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  const renderRemesaFileActions = (r: ControlRemesaRow) => (
    <>
      <RemesaVaultIconButton
        available={Boolean(r.LINK_XML_SEPA)}
        label="Descargar XML SEPA"
        icon={FileCode}
        onClick={
          r.LINK_XML_SEPA ? () => void handleDownloadXML(r.LINK_XML_SEPA as string) : undefined
        }
      />
      <RemesaVaultIconButton
        available={isRemesaExcelDownloadable(r.ESTADO)}
        label="Descargar Excel contable"
        icon={FileSpreadsheet}
        loading={generatingExcelRemesaId === r.ID_REMESA}
        onClick={
          isRemesaExcelDownloadable(r.ESTADO) ? () => void handleDownloadExcelRemesa(r) : undefined
        }
      />
      <RemesaVaultIconButton
        available={normalizeRemesaEstado(r.ESTADO) === "Enviada"}
        label="Descargar facturas ZIP"
        icon={FileArchive}
        loading={generatingZipRemesaId === r.ID_REMESA}
        onClick={
          normalizeRemesaEstado(r.ESTADO) === "Enviada"
            ? () => void handleDownloadZipRemesa(r)
            : undefined
        }
      />
    </>
  );

  const renderRemesaMobileCard = (r: ControlRemesaRow) => {
    const remesaEstado = normalizeRemesaEstado(r.ESTADO);

    return (
      <li
        key={r.ID_REMESA}
        className={cn(
          "border-b last:border-b-0",
          remesaId === r.ID_REMESA && "bg-primary/5 ring-2 ring-primary ring-inset",
        )}
      >
        <button
          type="button"
          className={cn(
            "w-full p-3 text-left transition-colors",
            canWrite && "hover:bg-muted/50",
          )}
          onClick={canWrite ? () => setEditing(r) : undefined}
          disabled={!canWrite}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-semibold capitalize text-slate-900">
                <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{r.MES_PERIODO || "—"}</span>
              </div>
              <p className="mt-1 truncate text-sm text-slate-700">
                {centroNameById.get(r.ID_CENTRO ?? "") ?? r.ID_CENTRO ?? "—"}
              </p>
              <p className="truncate text-sm text-slate-700">
                {cursoNameById.get(r.ID_CURSO ?? "") ?? r.ID_CURSO ?? "—"}
              </p>
            </div>
            <StatusBadge status={remesaEstadoStatus(remesaEstado)} className="shrink-0 capitalize text-[10px]">
              {remesaEstado}
            </StatusBadge>
          </div>
        </button>
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/10 px-3 py-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1">{renderRemesaFileActions(r)}</div>
          {canWrite && isRemesaGenerada(r.ESTADO) ? (
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={sendingRemesaId === r.ID_REMESA || validatingRemesaId === r.ID_REMESA}
              onClick={() => void requestEnviarRemesa(r)}
            >
              {sendingRemesaId === r.ID_REMESA || validatingRemesaId === r.ID_REMESA ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 h-3.5 w-3.5" />
              )}
              Enviar
            </Button>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Cabecera del panel */}
      <PageHeader
        title="Gestión de Recibos Mensuales"
        description={`${list.data?.length ?? 0} lotes de recibos borrador registrados en el sistema`}
        actions={
          canWrite && (
            <Button variant="brand" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Generar nuevos recibos
            </Button>
          )
        }
      />

      {(activeRemesaJobsQuery.data?.length ?? 0) > 0 && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Post-proceso de remesa en curso</AlertTitle>
          <AlertDescription>
            {activeRemesaJobsQuery.data?.map((job) => (
              <span key={job.ID_JOB} className="block">
                {job.MES_PERIODO}: PDF {job.PDF_OK + job.PDF_FAIL}/{job.PDF_TOTAL}
                {job.EXCEL_OK ? " · Excel listo" : " · Excel pendiente"}
              </span>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-4">
        {/* Buscador reactivo */}
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar remesa por periodo o estado..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        {list.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
            Error al cargar las remesas: {(list.error as Error)?.message}
          </div>
        )}

        {/* Tabla de operaciones bancarias */}
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo / Mes</TableHead>
                <TableHead>Centro</TableHead>
                <TableHead>Curso</TableHead>
                <TableHead>Estado Remesa</TableHead>
                <TableHead className="text-center">XML SEPA (Banco)</TableHead>
                <TableHead className="text-center">Excel Contable</TableHead>
                <TableHead className="text-center">Recibos ZIP</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    {query
                      ? "Sin resultados para tu búsqueda."
                      : "No hay lotes de recibos borrador registrados."}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r: ControlRemesaRow) => {
                  const remesaEstado = normalizeRemesaEstado(r.ESTADO);

                  return (
                    <TableRow
                      key={r.ID_REMESA}
                      className={cn(
                        canWrite && "cursor-pointer transition-colors hover:bg-muted/50",
                        remesaId === r.ID_REMESA && "bg-primary/5 ring-2 ring-primary ring-inset",
                      )}
                      onClick={canWrite ? () => setEditing(r) : undefined}
                    >
                      <TableCell className="font-semibold text-slate-900 capitalize">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {r.MES_PERIODO || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {centroNameById.get(r.ID_CENTRO ?? "") ?? r.ID_CENTRO ?? "—"}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {cursoNameById.get(r.ID_CURSO ?? "") ?? r.ID_CURSO ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={remesaEstadoStatus(remesaEstado)}
                          className="capitalize text-[10px]"
                        >
                          {remesaEstado}
                        </StatusBadge>
                      </TableCell>

                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center">
                          <RemesaVaultIconButton
                            available={Boolean(r.LINK_XML_SEPA)}
                            label="Descargar XML SEPA"
                            icon={FileCode}
                            onClick={
                              r.LINK_XML_SEPA
                                ? () => void handleDownloadXML(r.LINK_XML_SEPA as string)
                                : undefined
                            }
                          />
                        </div>
                      </TableCell>

                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center">
                          <RemesaVaultIconButton
                            available={isRemesaExcelDownloadable(r.ESTADO)}
                            label="Descargar Excel contable"
                            icon={FileSpreadsheet}
                            loading={generatingExcelRemesaId === r.ID_REMESA}
                            onClick={
                              isRemesaExcelDownloadable(r.ESTADO)
                                ? () => void handleDownloadExcelRemesa(r)
                                : undefined
                            }
                          />
                        </div>
                      </TableCell>

                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center">
                          <RemesaVaultIconButton
                            available={normalizeRemesaEstado(r.ESTADO) === "Enviada"}
                            label="Descargar facturas ZIP"
                            icon={FileArchive}
                            loading={generatingZipRemesaId === r.ID_REMESA}
                            onClick={
                              normalizeRemesaEstado(r.ESTADO) === "Enviada"
                                ? () => void handleDownloadZipRemesa(r)
                                : undefined
                            }
                          />
                        </div>
                      </TableCell>

                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {canWrite && isRemesaGenerada(r.ESTADO) && (
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={
                                sendingRemesaId === r.ID_REMESA ||
                                validatingRemesaId === r.ID_REMESA
                              }
                              onClick={() => void requestEnviarRemesa(r)}
                            >
                              {sendingRemesaId === r.ID_REMESA ||
                              validatingRemesaId === r.ID_REMESA ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="mr-1 h-3.5 w-3.5" />
                              )}
                              Enviar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <ul className="divide-y md:hidden">
          {list.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="p-3">
                <Skeleton className="h-24 w-full rounded-lg" />
              </li>
            ))
          ) : pageRows.length === 0 ? (
            <li className="py-10 text-center text-sm text-muted-foreground">
              {query
                ? "Sin resultados para tu búsqueda."
                : "No hay lotes de recibos borrador registrados."}
            </li>
          ) : (
            pageRows.map((r) => renderRemesaMobileCard(r))
          )}
        </ul>

        {/* Paginación real */}
        {filtered.length > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between text-sm border-t pt-4">
            <div className="text-muted-foreground">
              Página {page} de {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      <GenerarRemesaDialog
        open={creating}
        onClose={() => {
          if (!generatingRemesa) setCreating(false);
        }}
        submitting={generatingRemesa}
        onSubmit={async (payload) => {
          setGeneratingRemesa(true);
          try {
            const result = await generarRemesaMensual.mutateAsync(payload);
            const count = result?.recibos_generados ?? 0;
            const idRemesa = result?.id_remesa?.trim();

            if (!idRemesa) {
              toast.warning(
                `Remesa generada (${count} recibos), pero no se pudo encolar el post-proceso (falta id_remesa).`,
              );
              setCreating(false);
              return;
            }

            const idJob = await encolarRemesaPostProceso(idRemesa);
            let jobStarted = false;
            try {
              await invokeProcesarRemesaJob(idJob);
              jobStarted = true;
            } catch (jobErr) {
              toast.warning(
                `Remesa generada (${count} recibos). No se pudo iniciar el post-proceso en segundo plano: ${
                  jobErr instanceof Error ? jobErr.message : "Error desconocido."
                }`,
              );
            }

            if (jobStarted) {
              toast.success(
                `Remesa generada: ${count} recibos borrador. Los PDF y el Excel se procesan en segundo plano; puedes seguir usando la app.`,
              );
            }

            qc.invalidateQueries({ queryKey: tenantListKey("recibos", rol, tenantId) });
            qc.invalidateQueries({ queryKey: remesaGeneracionJobsQueryKey(tenantId, rol) });
            qc.invalidateQueries({
              predicate: (query) =>
                Array.isArray(query.queryKey) && query.queryKey[0] === "remesas",
            });

            setCreating(false);
          } catch (err) {
            if (isRestrictVetoError(err)) throw err;
            toast.error(collectErrorText(err) || "Error al generar la remesa");
            throw err;
          } finally {
            setGeneratingRemesa(false);
          }
        }}
      />

      {/* Edit Modal */}
      <RemesaEditDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Modificar Configuración de Remesa"
        submitLabel="Guardar Cambios"
        initial={editing}
        submitting={update.isPending}
        onSubmit={async (values) => {
          if (!editing) return;
          try {
            await update.mutateAsync({ id: editing.ID_REMESA, patch: values });
            toast.success("Registro de remesa actualizado correctamente");
            setEditing(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        }}
      />

      <AlertDialog
        open={!!confirmEnviarRemesa}
        onOpenChange={(open) => {
          if (!open && !sendingRemesaId) setConfirmEnviarRemesa(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar remesa al banco</AlertDialogTitle>
            <AlertDialogDescription>
              Se generará el XML SEPA para que lo subas al banco manualmente. Si el XML es correcto,
              la remesa pasará a Enviada y los recibos con método SEPA quedarán en Cobrado. Las
              facturas oficiales (Verifactu) solo se emitirán si la integración está disponible; el
              ZIP del listado contendrá facturas oficiales, no PDF borrador. ¿Deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(sendingRemesaId)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(sendingRemesaId)}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmEnviarRemesa();
              }}
            >
              {sendingRemesaId ? "Enviando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!duplicatePaymentPrompt}
        onOpenChange={(open) => {
          if (!open && duplicatePaymentPrompt) {
            resolveDuplicatePaymentPrompt(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inclusión en XML SEPA</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicatePaymentPrompt
                ? `${duplicatePaymentPrompt.alumnoNombre} ya ha pagado una factura este mes. ¿Desea incluirlo en el XML?`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveDuplicatePaymentPrompt(false)}>
              No
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => resolveDuplicatePaymentPrompt(true)}>
              Sí
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Modal */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este histórico bancario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará definitivamente el registro de la remesa del periodo{" "}
              <b>{deleting?.MES_PERIODO}</b>. Los archivos XML o ZIP enlazados dejarán de estar
              disponibles en esta consola. Esta operación es definitiva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync(deleting.ID_REMESA);
                  toast.success("Registro purgado de la base de datos");
                  setDeleting(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Error al eliminar");
                }
              }}
            >
              Eliminar Remesa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DIÁLOGO GENERAR REMESA (RPC generar_remesa_mensual)
// ---------------------------------------------------------------------------

function GenerarRemesaDialog({
  open,
  onClose,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  submitting: boolean;
  onSubmit: (payload: {
    p_id_cliente: string;
    p_id_centro: string;
    p_id_curso: string;
    p_mes_periodo: string;
  }) => Promise<void>;
}) {
  const { tenantId, centerId: profileCenterId, centro: activeCentro, rol } = useActiveTenant();
  const { workspaceOptions } = useApp();
  const centros = useCentros();

  const centrosOrdenados = useMemo(
    () => mergeTenantCentros(centros.list.data ?? [], workspaceOptions, tenantId),
    [centros.list.data, workspaceOptions, tenantId],
  );

  const defaultCenterId =
    activeCentro?.ID_CENTRO ?? profileCenterId ?? centrosOrdenados[0]?.ID_CENTRO ?? "";

  const showCentroSelect = isAdminRole(rol) || isMasterRole(rol);

  const [selectedCenterId, setSelectedCenterId] = useState("");
  const [selectedCursoId, setSelectedCursoId] = useState("");
  const [mesPeriodo, setMesPeriodo] = useState("");
  const [restrictVetoError, setRestrictVetoError] = useState<string | null>(null);

  const resolvedCenterId = showCentroSelect ? selectedCenterId || defaultCenterId : defaultCenterId;

  const { data: fetchedCursos, isLoading: fetchedCursosLoading } = useQuery({
    queryKey: ["remesa-curso-escolar", tenantId, resolvedCenterId],
    enabled: open && Boolean(resolvedCenterId),
    queryFn: async (): Promise<CursoEscolarData[]> => {
      const { data, error } = await supabase
        .from("CURSO_ESCOLAR")
        .select("*")
        .eq("ID_CLIENTE", tenantId)
        .eq("ID_CENTRO", resolvedCenterId)
        .order("FECHA_INICIO", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CursoEscolarData[];
    },
  });

  const cursosForResolvedCentro = fetchedCursos ?? [];

  const selectedCurso = useMemo(
    () => cursosForResolvedCentro.find((curso) => curso.ID_CURSO === selectedCursoId) ?? null,
    [fetchedCursos, selectedCursoId],
  );

  const monthOptions = useMemo(() => buildSchoolYearMonthOptions(selectedCurso), [selectedCurso]);

  const lockedCentroName = useMemo(() => {
    if (!resolvedCenterId) return "";
    return centrosOrdenados.find((c) => c.ID_CENTRO === resolvedCenterId)?.NOMBRE_CENTRO ?? "";
  }, [centrosOrdenados, resolvedCenterId]);

  useEffect(() => {
    if (!open) return;
    setRestrictVetoError(null);
    setMesPeriodo("");
    setSelectedCursoId("");
    setSelectedCenterId(defaultCenterId);
  }, [open, defaultCenterId]);

  useEffect(() => {
    if (!open || cursosForResolvedCentro.length === 0) {
      if (open) setSelectedCursoId("");
      return;
    }
    setSelectedCursoId((prev) => {
      if (prev && cursosForResolvedCentro.some((curso) => curso.ID_CURSO === prev)) return prev;
      const activo = cursosForResolvedCentro.find(
        (curso) => curso.ESTADO?.trim().toLowerCase() === "activo",
      );
      return activo?.ID_CURSO ?? cursosForResolvedCentro[0]?.ID_CURSO ?? "";
    });
  }, [open, cursosForResolvedCentro]);

  useEffect(() => {
    if (!open || monthOptions.length === 0) return;
    const currentMonth = currentMonthPeriodLabel();
    setMesPeriodo((prev) => {
      if (prev && monthOptions.includes(prev)) return prev;
      if (monthOptions.includes(currentMonth)) return currentMonth;
      return monthOptions[monthOptions.length - 1] ?? "";
    });
  }, [open, monthOptions, selectedCursoId]);

  const canSubmit =
    Boolean(resolvedCenterId) &&
    Boolean(selectedCurso?.ID_CURSO) &&
    Boolean(mesPeriodo) &&
    !submitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !submitting) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "max-w-lg",
          submitting && "[&>button]:pointer-events-none [&>button]:opacity-30",
        )}
        onPointerDownOutside={(e) => {
          if (submitting) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (submitting) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Generar lote de recibos borrador</DialogTitle>
          <DialogDescription>
            Se crearán recibos en estado Borrador. Los PDF borrador y el Excel de control se generan
            en segundo plano; puedes cerrar este diálogo y seguir usando la app. Antes de usar
            Enviar, revisa las fichas de alumno y Compras internas. El XML SEPA, el ZIP de recibos y
            el envío al banco no ocurren al generar; corresponden al paso Enviar.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setRestrictVetoError(null);

            try {
              await executeGenerarRemesaSubmit({
                id_cliente: tenantId,
                id_centro: resolvedCenterId,
                id_curso: selectedCurso?.ID_CURSO ?? "",
                mes_periodo: mesPeriodo,
                onSubmit,
              });
            } catch (err) {
              if (isRestrictVetoError(err)) {
                setRestrictVetoError(
                  "Ya existe una remesa para este mes, centro y curso. Revísala en el listado de remesas.",
                );
              }
            }
          }}
          className="space-y-4 pt-1"
        >
          {restrictVetoError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Remesa duplicada</AlertTitle>
              <AlertDescription>{restrictVetoError}</AlertDescription>
            </Alert>
          )}

          {submitting && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Generando remesa</AlertTitle>
              <AlertDescription>
                Se están creando los recibos borrador. El post-proceso (PDF y Excel) continuará en
                segundo plano.
              </AlertDescription>
            </Alert>
          )}

          {showCentroSelect ? (
            <div className="space-y-2">
              <Label>Sede / Centro *</Label>
              <Select
                value={resolvedCenterId || undefined}
                onValueChange={setSelectedCenterId}
                disabled={submitting || centros.list.isLoading || centrosOrdenados.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un centro" />
                </SelectTrigger>
                <SelectContent>
                  {centrosOrdenados.map((centro) => (
                    <SelectItem key={centro.ID_CENTRO} value={centro.ID_CENTRO}>
                      {centro.NOMBRE_CENTRO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            lockedCentroName && (
              <div className="space-y-2">
                <Label>Sede / Centro</Label>
                <Input value={lockedCentroName} disabled readOnly className="bg-muted" />
              </div>
            )
          )}

          <div className="space-y-2">
            <Label>Curso escolar *</Label>
            <Select
              value={selectedCursoId || undefined}
              onValueChange={setSelectedCursoId}
              disabled={
                submitting ||
                cursosForResolvedCentro.length === 0 ||
                centros.list.isLoading ||
                fetchedCursosLoading
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un curso" />
              </SelectTrigger>
              <SelectContent>
                {cursosForResolvedCentro.map((curso) => (
                  <SelectItem key={curso.ID_CURSO} value={curso.ID_CURSO}>
                    {curso.NOMBRE_CURSO}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cursosForResolvedCentro.length === 0 &&
              resolvedCenterId &&
              !centros.list.isLoading &&
              !fetchedCursosLoading && (
                <p className="text-xs text-muted-foreground">
                  No hay cursos escolares configurados para este centro.
                </p>
              )}
          </div>

          <div className="space-y-2">
            <Label>Mes / Periodo de la Remesa *</Label>
            <Select
              value={mesPeriodo}
              onValueChange={setMesPeriodo}
              disabled={
                submitting ||
                monthOptions.length === 0 ||
                centros.list.isLoading ||
                fetchedCursosLoading
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un mes" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {monthOptions.length === 0 &&
              selectedCursoId &&
              !centros.list.isLoading &&
              !fetchedCursosLoading && (
                <p className="text-xs text-muted-foreground">
                  No hay meses disponibles para el curso seleccionado.
                </p>
              )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generando…
                </>
              ) : (
                "Generar Entrada"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// DIÁLOGO EDICIÓN DE REMESA (enlaces n8n / estado manual)
// ---------------------------------------------------------------------------

function RemesaEditDialog({
  open,
  onClose,
  title,
  submitLabel,
  initial,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: ControlRemesaRow | null;
  submitting: boolean;
  onSubmit: (values: ControlRemesaUpdatePatch) => void;
}) {
  const [mesPeriodo, setMesPeriodo] = useState(initial?.MES_PERIODO ?? "");
  const [estado, setEstado] = useState(initial?.ESTADO ?? "Generada");
  const [linkXmlSepa, setLinkXmlSepa] = useState(initial?.LINK_XML_SEPA ?? "");
  const [linkExcelContabilidad, setLinkExcelContabilidad] = useState(
    initial?.LINK_EXCEL_CONTABILIDAD ?? "",
  );
  const [linkRecibosZip, setLinkRecibosZip] = useState(initial?.LINK_RECIBOS_ZIP ?? "");

  useEffect(() => {
    if (open) {
      setMesPeriodo(initial?.MES_PERIODO ?? "");
      setEstado(initial?.ESTADO ?? "Generada");
      setLinkXmlSepa(initial?.LINK_XML_SEPA ?? "");
      setLinkExcelContabilidad(initial?.LINK_EXCEL_CONTABILIDAD ?? "");
      setLinkRecibosZip(initial?.LINK_RECIBOS_ZIP ?? "");
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!mesPeriodo.trim()) return;
            onSubmit({
              MES_PERIODO: mesPeriodo.trim(),
              ESTADO: estado || null,
              LINK_XML_SEPA: linkXmlSepa || null,
              LINK_EXCEL_CONTABILIDAD: linkExcelContabilidad || null,
              LINK_RECIBOS_ZIP: linkRecibosZip || null,
            });
          }}
          className="space-y-4 pt-1"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Mes / Periodo de la Remesa *</Label>
              <Input
                value={mesPeriodo}
                onChange={(e) => setMesPeriodo(e.target.value)}
                placeholder="Ej: Junio 2026"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Estado de Operación</Label>
              <Input
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                placeholder="Generada, Enviada, Cobrada, Devuelta..."
              />
            </div>
          </div>

          <div className="border-t pt-3 space-y-3 mt-2 bg-slate-50/50 p-2.5 rounded border">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <HelpCircle className="h-4 w-4 text-blue-900" />
              Direcciones URL de Repositorio (Alimentadas por n8n)
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ruta Archivo XML SEPA (.xml)</Label>
              <Input
                className="h-8 text-xs font-mono"
                value={linkXmlSepa}
                onChange={(e) => setLinkXmlSepa(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ruta Libro Excel Contable (.xlsx)</Label>
              <Input
                className="h-8 text-xs font-mono"
                value={linkExcelContabilidad}
                onChange={(e) => setLinkExcelContabilidad(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ruta Comprobantes Comprimidos (.zip)</Label>
              <Input
                className="h-8 text-xs font-mono"
                value={linkRecibosZip}
                onChange={(e) => setLinkRecibosZip(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
