import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";

export const VENTAS_LINEAS_SELECT =
  "ID_LINEA, ID_CLIENTE, ID_RECIBO, CONCEPTO, ID_MATRICULA, CANTIDAD, PRECIO_UNITARIO, DESCUENTO_LINEA, IVA_PORCENTAJE, SUBTOTAL" as const;

export type VentaLineaRow = {
  ID_LINEA: string;
  ID_CLIENTE: string;
  ID_RECIBO: string;
  CONCEPTO: string;
  ID_MATRICULA: string | null;
  CANTIDAD: number;
  PRECIO_UNITARIO: number;
  DESCUENTO_LINEA: number | null;
  IVA_PORCENTAJE: number | null;
  SUBTOTAL: number;
};

export type VentaLineaUpdateInput = {
  CONCEPTO: string;
  CANTIDAD: number;
  PRECIO_UNITARIO: number;
  IVA_PORCENTAJE: number;
};

export function calcVentaLineaSubtotal(
  cantidad: number,
  precioUnitario: number,
  ivaPorcentaje: number,
): number {
  const base = cantidad * precioUnitario;
  if (ivaPorcentaje > 0) {
    return Math.round(base * (1 + ivaPorcentaje / 100) * 100) / 100;
  }
  return base;
}

function ventasLineasQueryKey(
  reciboId: string,
  rol: string | null | undefined,
  tenantId: string,
) {
  return ["ventasLineas", reciboId, ...tenantListKey("ventas-lineas", rol, tenantId)] as const;
}

export async function invokeGenerarPdfBorradorRecibo(idRecibo: string): Promise<string> {
  const scopedId = idRecibo.trim();
  if (!scopedId) {
    throw new Error("Recibo no válido.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Tu sesión ha caducado. Cierra sesión y vuelve a entrar.");
  }

  const { data, error } = await supabase.functions.invoke("generar-pdf-borrador-recibo", {
    body: { id_recibo: scopedId },
  });

  if (error) {
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status === 401) {
      throw new Error("No autorizado para generar el PDF borrador.");
    }
    throw new Error(error instanceof Error ? error.message : "Error al generar el PDF borrador.");
  }

  const payload = data as { link?: string; error?: string } | null;
  if (payload?.error) {
    throw new Error(payload.error);
  }
  if (!payload?.link?.trim()) {
    throw new Error("La función no devolvió enlace del PDF borrador.");
  }
  return payload.link.trim();
}

export type GenerarExcelRemesaControlInput = {
  id_cliente: string;
  id_centro: string;
  id_curso: string;
  mes_periodo: string;
};

export async function invokeGenerarExcelRemesaControl(
  input: GenerarExcelRemesaControlInput,
): Promise<string> {
  const idCliente = input.id_cliente.trim();
  const idCentro = input.id_centro.trim();
  const idCurso = input.id_curso.trim();
  const mesPeriodo = input.mes_periodo.trim();

  if (!idCliente || !idCentro || !idCurso || !mesPeriodo) {
    throw new Error("Faltan datos de la remesa para generar el Excel de control.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Tu sesión ha caducado. Cierra sesión y vuelve a entrar.");
  }

  const { data, error } = await supabase.functions.invoke("generar-excel-remesa-control", {
    body: {
      id_cliente: idCliente,
      id_centro: idCentro,
      id_curso: idCurso,
      mes_periodo: mesPeriodo,
    },
  });

  if (error) {
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status === 401) {
      throw new Error("No autorizado para generar el Excel de control.");
    }
    throw new Error(error instanceof Error ? error.message : "Error al generar el Excel de control.");
  }

  const payload = data as { link?: string; error?: string } | null;
  if (payload?.error) {
    throw new Error(payload.error);
  }
  if (!payload?.link?.trim()) {
    throw new Error("La función no devolvió enlace del Excel de control.");
  }
  return payload.link.trim();
}

export type VentaLineaUpdateResult = {
  line: VentaLineaRow;
  pdfError: string | null;
  excelError: string | null;
};

export function useVentasLineas(reciboId: string | null | undefined) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const scopedReciboId = reciboId?.trim() ?? "";
  const queryKey = ventasLineasQueryKey(scopedReciboId, rol, tenantId);

  const list = useQuery({
    queryKey,
    enabled: Boolean(scopedReciboId),
    queryFn: async () => {
      let query = supabase
        .from("VENTAS_LINEAS")
        .select(VENTAS_LINEAS_SELECT)
        .eq("ID_RECIBO", scopedReciboId)
        .order("CONCEPTO", { ascending: true });
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as VentaLineaRow[];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: VentaLineaUpdateInput }) => {
      if (!scopedReciboId) {
        throw new Error("Recibo no válido.");
      }

      const subtotal = calcVentaLineaSubtotal(
        patch.CANTIDAD,
        patch.PRECIO_UNITARIO,
        patch.IVA_PORCENTAJE,
      );

      const { data, error } = await supabase
        .from("VENTAS_LINEAS")
        .update({
          CONCEPTO: patch.CONCEPTO.trim(),
          CANTIDAD: patch.CANTIDAD,
          PRECIO_UNITARIO: patch.PRECIO_UNITARIO,
          IVA_PORCENTAJE: patch.IVA_PORCENTAJE,
          SUBTOTAL: subtotal,
        })
        .eq("ID_LINEA", id)
        .eq("ID_CLIENTE", tenantId)
        .select(VENTAS_LINEAS_SELECT)
        .single();
      if (error) throw error;

      const { error: rpcError } = await supabase.rpc("recalcular_recibo_desde_lineas", {
        p_id_recibo: scopedReciboId,
      });
      if (rpcError) throw rpcError;

      let pdfError: string | null = null;
      try {
        await invokeGenerarPdfBorradorRecibo(scopedReciboId);
      } catch (err) {
        pdfError = err instanceof Error ? err.message : "No se pudo regenerar el PDF borrador.";
      }

      let excelError: string | null = null;
      try {
        const { data: reciboMeta, error: reciboMetaErr } = await supabase
          .from("RECIBOS_MENSUALES")
          .select("ID_CLIENTE, ID_CENTRO, ID_CURSO, MES_PERIODO")
          .eq("ID_RECIBO", scopedReciboId)
          .single();
        if (reciboMetaErr) throw reciboMetaErr;
        if (
          reciboMeta?.ID_CLIENTE &&
          reciboMeta.ID_CENTRO &&
          reciboMeta.ID_CURSO &&
          reciboMeta.MES_PERIODO
        ) {
          await invokeGenerarExcelRemesaControl({
            id_cliente: reciboMeta.ID_CLIENTE,
            id_centro: reciboMeta.ID_CENTRO,
            id_curso: reciboMeta.ID_CURSO,
            mes_periodo: reciboMeta.MES_PERIODO,
          });
        }
      } catch (err) {
        excelError = err instanceof Error ? err.message : "No se pudo regenerar el Excel de control.";
      }

      return { line: data as VentaLineaRow, pdfError, excelError };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          (query.queryKey[0] === "recibos" ||
            query.queryKey[0] === "recibos-meses" ||
            query.queryKey[0] === "remesas"),
      });
    },
  });

  return { list, update };
}
