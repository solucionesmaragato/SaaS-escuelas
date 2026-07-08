import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  appendIdInFilter,
  centerFilterQueryKey,
  fetchProfesorIdsForCenter,
} from "@/lib/centroFilter";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
  isSecretariaRole,
  scopeTenantQuery,
  tenantListKey,
} from "@/lib/tenantQuery";

const DOCUMENTO_SELECT_COLUMNS =
  "ID_DOCUMENTO, ID_CLIENTE, ID_PROFESOR, ID_CENTRO, CATEGORIA, URL_ORIGINAL, URL_FIRMADO, ABIERTO_ADMIN, ABIERTO_PROFESOR, REQUIERE_FIRMA, ESTADO_FIRMA, FECHA_SUBIDA, FECHA_FIRMA, FECHA_CADUCIDAD" as const;

const PROFESOR_LOOKUP_COLUMNS = "ID_PROFESOR, NOMBRE_PROFESOR, FECHA_BAJA" as const;

export interface ProfesorLookup {
  ID_PROFESOR: string;
  NOMBRE_PROFESOR: string;
  FECHA_BAJA?: string | null;
}

export interface DocumentoData {
  ID_DOCUMENTO: string;
  ID_CLIENTE: string;
  ID_PROFESOR: string;
  ID_CENTRO?: string | null;
  CATEGORIA: string;
  URL_ORIGINAL: string | null;
  URL_FIRMADO: string | null;
  ABIERTO_ADMIN: boolean;
  ABIERTO_PROFESOR: boolean;
  REQUIERE_FIRMA: boolean;
  ESTADO_FIRMA: string | null;
  FECHA_SUBIDA: string | null;
  FECHA_FIRMA: string | null;
  FECHA_CADUCIDAD: string | null;
  NOMBRE_PROFESOR: string;
}

export type DocumentoCreateInput = {
  ID_PROFESOR: string;
  ID_CENTRO?: string | null;
  CATEGORIA: string;
  file?: File;
  REQUIERE_FIRMA?: boolean;
  FECHA_CADUCIDAD?: string | null;
  ID_CLIENTE?: string;
};

export type DocumentoUpdateInput = Partial<
  Omit<DocumentoCreateInput, "file"> & {
    signedFile?: File;
    ABIERTO_ADMIN: boolean;
    ABIERTO_PROFESOR: boolean;
  }
>;

const DOCUMENTOS_LEGALES_BUCKET = "documentos-legales" as const;

export type DocumentosQueryData = {
  documentos: DocumentoData[];
  profesores: ProfesorLookup[];
};

type DocumentoRow = {
  ID_DOCUMENTO: string;
  ID_CLIENTE: string;
  ID_PROFESOR: string;
  ID_CENTRO?: string | null;
  CATEGORIA: string;
  URL_ORIGINAL: string | null;
  URL_FIRMADO: string | null;
  ABIERTO_ADMIN: boolean | string | null;
  ABIERTO_PROFESOR: boolean | string | null;
  REQUIERE_FIRMA: boolean | string | null;
  ESTADO_FIRMA: string | null;
  FECHA_SUBIDA: string | null;
  FECHA_FIRMA: string | null;
  FECHA_CADUCIDAD: string | null;
};

function normalizeBool(value: unknown): boolean {
  return value === true || value === "TRUE" || value === "true" || value === 1;
}

function assertCanCreate(rol: string | null | undefined) {
  if (isMasterRole(rol) || isAdminRole(rol)) return;
  throw new Error("No tienes permiso para crear documentos.");
}

function assertCanDelete(rol: string | null | undefined) {
  if (isMasterRole(rol) || isAdminRole(rol)) return;
  throw new Error("No tienes permiso para eliminar documentos.");
}

function isEmployeeDocumentRole(rol: string | null | undefined): boolean {
  return isProfesorRole(rol) || isDireccionRole(rol) || isSecretariaRole(rol);
}

function buildProfesorUpdatePatch(patch: DocumentoUpdateInput): DocumentoUpdateInput {
  const result: DocumentoUpdateInput = {};
  if (patch.ABIERTO_PROFESOR !== undefined) result.ABIERTO_PROFESOR = patch.ABIERTO_PROFESOR;
  if (patch.signedFile !== undefined) result.signedFile = patch.signedFile;
  return result;
}

async function uploadDocumentoLegalFile(filePath: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(DOCUMENTOS_LEGALES_BUCKET).upload(filePath, file);
  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(DOCUMENTOS_LEGALES_BUCKET).getPublicUrl(filePath);
  return publicUrl;
}

async function resolveDocumentoDbPatch(
  patch: DocumentoUpdateInput,
  tenantId: string,
  documentoId: string,
): Promise<Record<string, unknown>> {
  const { signedFile, ...rest } = patch;
  const dbPatch: Record<string, unknown> = { ...rest };

  if (signedFile) {
    const filePath = `${tenantId}/signed_${documentoId}_${crypto.randomUUID()}.pdf`;
    dbPatch.URL_FIRMADO = await uploadDocumentoLegalFile(filePath, signedFile);
  }

  return dbPatch;
}

function mapDocumentoRow(row: DocumentoRow, nombreProfesor: string): DocumentoData {
  return {
    ID_DOCUMENTO: row.ID_DOCUMENTO,
    ID_CLIENTE: row.ID_CLIENTE,
    ID_PROFESOR: row.ID_PROFESOR,
    ID_CENTRO: row.ID_CENTRO ?? null,
    CATEGORIA: row.CATEGORIA,
    URL_ORIGINAL: row.URL_ORIGINAL,
    URL_FIRMADO: row.URL_FIRMADO,
    ABIERTO_ADMIN: normalizeBool(row.ABIERTO_ADMIN),
    ABIERTO_PROFESOR: normalizeBool(row.ABIERTO_PROFESOR),
    REQUIERE_FIRMA: normalizeBool(row.REQUIERE_FIRMA),
    ESTADO_FIRMA: row.ESTADO_FIRMA,
    FECHA_SUBIDA: row.FECHA_SUBIDA,
    FECHA_FIRMA: row.FECHA_FIRMA,
    FECHA_CADUCIDAD: row.FECHA_CADUCIDAD,
    NOMBRE_PROFESOR: nombreProfesor,
  };
}

function mapDocumentos(
  rows: DocumentoRow[],
  profesores: ProfesorLookup[],
): DocumentoData[] {
  const profById = new Map(profesores.map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR]));

  return rows.map((row) =>
    mapDocumentoRow(row, profById.get(row.ID_PROFESOR) ?? row.ID_PROFESOR),
  );
}

export function useDocumentos(filterCenterId?: string | null, profesorId?: string | null) {
  const { tenantId, rol, perfil } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("documentos", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
    profesorId ?? "all",
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<DocumentosQueryData> => {
      // DOCUMENTOS_LEGALES_V2 has no ID_CENTRO — scope by PERFILES.ID_CENTRO via ID_PROFESOR.
      const profesorIds = await fetchProfesorIdsForCenter(tenantId, filterCenterId);
      if (profesorIds && profesorIds.length === 0) {
        return { documentos: [], profesores: [] };
      }

      let documentoQuery = supabase.from("DOCUMENTOS_LEGALES_V2").select(DOCUMENTO_SELECT_COLUMNS);
      documentoQuery = scopeTenantQuery(documentoQuery, rol, tenantId);

      if (isEmployeeDocumentRole(rol) && perfil?.ID_PROFESOR) {
        documentoQuery = documentoQuery.eq("ID_PROFESOR", perfil.ID_PROFESOR);
      } else {
        const scoped = appendIdInFilter(documentoQuery, "ID_PROFESOR", profesorIds);
        if (scoped === "empty") {
          return { documentos: [], profesores: [] };
        }
        documentoQuery = scoped;
        if (profesorId) documentoQuery = documentoQuery.eq("ID_PROFESOR", profesorId);
      }

      let profesorQuery = supabase.from("PROFESOR").select(PROFESOR_LOOKUP_COLUMNS);
      profesorQuery = scopeTenantQuery(profesorQuery, rol, tenantId);

      if (isEmployeeDocumentRole(rol) && perfil?.ID_PROFESOR) {
        profesorQuery = profesorQuery.eq("ID_PROFESOR", perfil.ID_PROFESOR);
      } else if (profesorIds) {
        profesorQuery = profesorQuery.in("ID_PROFESOR", profesorIds);
      }

      const [{ data: documentos, error }, { data: profesores, error: profError }] =
        await Promise.all([
          documentoQuery.order("FECHA_SUBIDA", { ascending: false }),
          profesorQuery.order("NOMBRE_PROFESOR", { ascending: true }),
        ]);

      if (error) throw error;
      if (profError) throw profError;

      const profesoresMapped: ProfesorLookup[] = (profesores ?? []).map((p) => ({
        ID_PROFESOR: p.ID_PROFESOR,
        NOMBRE_PROFESOR: p.NOMBRE_PROFESOR,
      }));

      const mappedData = mapDocumentos(
        (documentos ?? []) as DocumentoRow[],
        profesoresMapped,
      );

      const sortedData = [...mappedData].sort((a: DocumentoData, b: DocumentoData) => {
        const aReqFirma =
          a.REQUIERE_FIRMA === true || String(a.REQUIERE_FIRMA).toLowerCase() === "true";
        const bReqFirma =
          b.REQUIERE_FIRMA === true || String(b.REQUIERE_FIRMA).toLowerCase() === "true";

        const aPending = aReqFirma && String(a.ESTADO_FIRMA).toLowerCase() === "pendiente";
        const bPending = bReqFirma && String(b.ESTADO_FIRMA).toLowerCase() === "pendiente";

        if (aPending && !bPending) return -1;
        if (!aPending && bPending) return 1;

        const timeA = a.FECHA_SUBIDA ? new Date(a.FECHA_SUBIDA).getTime() : 0;
        const timeB = b.FECHA_SUBIDA ? new Date(b.FECHA_SUBIDA).getTime() : 0;

        const safeTimeA = isNaN(timeA) ? 0 : timeA;
        const safeTimeB = isNaN(timeB) ? 0 : timeB;

        return safeTimeB - safeTimeA;
      });

      return {
        documentos: sortedData,
        profesores: profesoresMapped,
      };
    },
  });

  const create = useMutation({
    mutationFn: async (newDoc: DocumentoCreateInput) => {
      assertCanCreate(rol);
      if (!tenantId) throw new Error("No hay un tenant activo.");
      if (!newDoc.file) throw new Error("Debes seleccionar un archivo PDF.");

      const fileExt = newDoc.file.name.split(".").pop() || "pdf";
      const filePath = `${tenantId}/original_${crypto.randomUUID()}.${fileExt}`;
      const publicUrl = await uploadDocumentoLegalFile(filePath, newDoc.file);

      const payload = {
        ID_PROFESOR: newDoc.ID_PROFESOR || null,
        ID_CENTRO: newDoc.ID_CENTRO || null,
        CATEGORIA: newDoc.CATEGORIA,
        URL_ORIGINAL: publicUrl,
        REQUIERE_FIRMA: newDoc.REQUIERE_FIRMA || false,
        FECHA_CADUCIDAD: newDoc.FECHA_CADUCIDAD || null,
        CREADO_POR: perfil?.EMAIL || null,
      };

      const { data, error } = await supabase
        .from("DOCUMENTOS_LEGALES_V2")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        console.error("SUPABASE CREATE ERROR DETAILS:", error);
        throw error;
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: DocumentoUpdateInput }) => {
      let finalPatch: DocumentoUpdateInput;

      if (isMasterRole(rol) || isAdminRole(rol)) {
        finalPatch = patch;
      } else if (isEmployeeDocumentRole(rol)) {
        if (!perfil?.ID_PROFESOR) {
          throw new Error("Tu perfil no tiene un trabajador asociado.");
        }

        const { data: existing, error: fetchErr } = await supabase
          .from("DOCUMENTOS_LEGALES_V2")
          .select("ID_PROFESOR")
          .eq("ID_DOCUMENTO", id)
          .single();
        if (fetchErr) throw fetchErr;
        if (existing.ID_PROFESOR !== perfil.ID_PROFESOR) {
          throw new Error("Solo puedes modificar tus propios documentos.");
        }

        finalPatch = buildProfesorUpdatePatch(patch);
        if (Object.keys(finalPatch).length === 0) {
          throw new Error("No tienes permiso para modificar este documento.");
        }
      } else {
        throw new Error("No tienes permiso para modificar documentos.");
      }

      if (!tenantId) throw new Error("No hay un tenant activo.");
      const dbPatch = await resolveDocumentoDbPatch(finalPatch, tenantId, id);

      let query = supabase
        .from("DOCUMENTOS_LEGALES_V2")
        .update(dbPatch)
        .eq("ID_DOCUMENTO", id);

      if (!isMasterRole(rol)) {
        query = query.eq("ID_CLIENTE", tenantId);
      }

      const { data, error } = await query.select(DOCUMENTO_SELECT_COLUMNS).single();
      if (error) throw error;
      return data as DocumentoRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertCanDelete(rol);

      let query = supabase.from("DOCUMENTOS_LEGALES_V2").delete().eq("ID_DOCUMENTO", id);
      if (!isMasterRole(rol)) {
        query = query.eq("ID_CLIENTE", tenantId);
      }

      const { error } = await query;
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
