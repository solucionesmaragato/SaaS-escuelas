-- 1) Evitar que un UPDATE parcial borre ID_PROFESOR / ID_AULA en HORARIOS_MATRICULAS.
-- 2) Restaurar PRO_bcdfbb40 en los 4 horarios individuales de Pablo Ruiz Fernández (ESC_018).
--    El trigger tg_sync_alumnos_y_calendario regenerará las SESIONES futuras con ese profesor.

CREATE OR REPLACE FUNCTION public.tg_horarios_proteger_edicion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    -- ESCUDO ABSOLUTO: Evaluamos si el Front envía NULL o cadena vacía ('').
    -- Si es así, se anula el input nuevo y se restaura el valor histórico inmutable (OLD).

    -- Claves Relacionales Maestras
    NEW."ID_CLIENTE"       := COALESCE(NULLIF(NEW."ID_CLIENTE", ''), OLD."ID_CLIENTE");
    NEW."ID_MATRICULA"     := COALESCE(NULLIF(NEW."ID_MATRICULA", ''), OLD."ID_MATRICULA");
    NEW."ID_ALUMNO"        := COALESCE(NULLIF(NEW."ID_ALUMNO", ''), OLD."ID_ALUMNO");
    NEW."ID_CENTRO"        := COALESCE(NULLIF(NEW."ID_CENTRO", ''), OLD."ID_CENTRO");
    NEW."ID_CURSO"         := COALESCE(NULLIF(NEW."ID_CURSO", ''), OLD."ID_CURSO");

    -- Recursos de impartición (evitar borrado accidental desde el front)
    NEW."ID_PROFESOR"      := COALESCE(NULLIF(NEW."ID_PROFESOR", ''), OLD."ID_PROFESOR");
    NEW."ID_AULA"          := COALESCE(NULLIF(NEW."ID_AULA", ''), OLD."ID_AULA");

    -- Claves Académicas y Económicas
    NEW."ID_ESPECIALIDAD"  := COALESCE(NULLIF(NEW."ID_ESPECIALIDAD", ''), OLD."ID_ESPECIALIDAD");
    NEW."ID_TARIFA"        := COALESCE(NULLIF(NEW."ID_TARIFA", ''), OLD."ID_TARIFA");
    NEW."ID_GRUPO"         := COALESCE(NULLIF(NEW."ID_GRUPO", ''), OLD."ID_GRUPO");
    NEW."ID_GRUPO_HORARIO" := COALESCE(NULLIF(NEW."ID_GRUPO_HORARIO", ''), OLD."ID_GRUPO_HORARIO");

    -- Protección de Metadatos de Estado
    NEW."ESTADO"           := COALESCE(NULLIF(NEW."ESTADO", ''), OLD."ESTADO");
    NEW."TIPO_CLASE"       := COALESCE(NULLIF(NEW."TIPO_CLASE", ''), OLD."TIPO_CLASE");
    NEW."TIPO_SESION"      := COALESCE(NULLIF(NEW."TIPO_SESION", ''), OLD."TIPO_SESION");

    RETURN NEW;
END;
$function$;

-- Restaurar profesor en horarios individuales cuyas SESIONES históricas apuntan a PRO_bcdfbb40
-- pero cuyo ID_PROFESOR quedó NULL por un UPDATE parcial del frontend.
UPDATE public."HORARIOS_MATRICULAS" hm
SET "ID_PROFESOR" = 'PRO_bcdfbb40'
WHERE hm."ID_HORARIO" IN (
  '28936fe5-d5a5-454f-9820-fca05788e4cf',
  '41297502-ca98-4a07-8b49-e407ce0f3ec3',
  '6cd94e1e-b70c-4105-89c1-55c714bbab15',
  '83951afb-d5e6-4929-88ae-a907efd91785'
)
AND hm."ID_CLIENTE" = 'ESC_018'
AND (hm."ID_PROFESOR" IS NULL OR trim(hm."ID_PROFESOR") = '');
