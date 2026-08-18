-- obtener_id_alumnos_por_profesor: guardia caller PROFESOR (p_id_profesor = get_my_teacher_id()).
-- Staff (MASTER/ADMIN/SECRETARIA/DIRECCION) sin cambio de comportamiento.
-- No modifica get_my_tenant_id, get_my_center_id, get_my_rol ni get_my_teacher_id.

CREATE OR REPLACE FUNCTION public.obtener_id_alumnos_por_profesor(p_id_profesor text)
 RETURNS TABLE("ID_ALUMNO" text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT DISTINCT hm."ID_ALUMNO"
    FROM public."HORARIOS_MATRICULAS" hm
    WHERE hm."ID_PROFESOR" = p_id_profesor
      AND hm."ESTADO" = 'Activo'
      AND (
        public.get_my_rol() <> 'PROFESOR'
        OR (
          nullif(trim(coalesce(public.get_my_teacher_id(), '')), '') IS NOT NULL
          AND trim(coalesce(p_id_profesor, '')) = trim(public.get_my_teacher_id())
        )
      );
$function$;
