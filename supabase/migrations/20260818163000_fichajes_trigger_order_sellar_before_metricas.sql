-- FICHAJES: BEFORE INSERT triggers fire in alphabetical order by name.
-- Previously tr_procesar_metricas_y_alertas ran before tr_sellar_fichaje_legal,
-- so FECHA_HORA was NULL during session validation and every Entrada got ESTADO = 'Alerta'.
-- Order: generate ID → seal FECHA_HORA/hash → metrics/alerts.

DROP TRIGGER IF EXISTS tr_fichajes_before_insert ON public."FICHAJES";
DROP TRIGGER IF EXISTS tr_procesar_metricas_y_alertas ON public."FICHAJES";
DROP TRIGGER IF EXISTS tr_sellar_fichaje_legal ON public."FICHAJES";

CREATE TRIGGER tr_01_fichajes_before_insert
  BEFORE INSERT ON public."FICHAJES"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_fichajes_before_insert();

CREATE TRIGGER tr_02_sellar_fichaje_legal
  BEFORE INSERT ON public."FICHAJES"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sellar_fichaje_legal();

CREATE TRIGGER tr_03_procesar_metricas_y_alertas
  BEFORE INSERT ON public."FICHAJES"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_procesar_metricas_y_alertas();
