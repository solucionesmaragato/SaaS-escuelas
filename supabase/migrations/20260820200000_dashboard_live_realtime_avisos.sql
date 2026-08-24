-- Dashboard live: publicar AVISOS_INTERNOS en supabase_realtime.
-- REPLICA IDENTITY FULL permite filtros por ID_CLIENTE en DELETE/UPDATE.

ALTER TABLE public."AVISOS_INTERNOS" REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public."AVISOS_INTERNOS";
