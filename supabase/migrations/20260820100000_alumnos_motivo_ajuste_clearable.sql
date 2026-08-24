-- Permitir borrar MOTIVO_AJUSTE (NULL o '') tras generar remesa.
-- El resto del escudo de tg_alumnos_proteger_edicion_total permanece igual.

CREATE OR REPLACE FUNCTION public.tg_alumnos_proteger_edicion_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- ESCUDO ATÓMICO: Filtrado completo de nulos y cadenas vacías para la tabla public."ALUMNOS"
    
    -- 1. Identificadores y Datos Maestros de Control
    NEW."ID_CLIENTE"            := COALESCE(NULLIF(NEW."ID_CLIENTE", ''), OLD."ID_CLIENTE");
    NEW."ID_CENTRO"             := COALESCE(NULLIF(NEW."ID_CENTRO", ''), OLD."ID_CENTRO");
    NEW."ID_CURSO"              := COALESCE(NULLIF(NEW."ID_CURSO", ''), OLD."ID_CURSO");
    NEW."ESTADO_ALUMNO"         := COALESCE(NULLIF(NEW."ESTADO_ALUMNO", ''), OLD."ESTADO_ALUMNO");
    NEW."ESTADO_MATRICULA"      := COALESCE(NULLIF(NEW."ESTADO_MATRICULA", ''), OLD."ESTADO_MATRICULA");
    NEW."ESTADO_RESERVA"        := COALESCE(NULLIF(NEW."ESTADO_RESERVA", ''), OLD."ESTADO_RESERVA");

    -- 2. Datos Personales del Alumno
    NEW."NOMBRE_ALUMNO"         := COALESCE(NULLIF(NEW."NOMBRE_ALUMNO", ''), OLD."NOMBRE_ALUMNO");
    NEW."DNI"                   := COALESCE(NULLIF(NEW."DNI", ''), OLD."DNI");
    NEW."MAIL"                  := COALESCE(NULLIF(NEW."MAIL", ''), OLD."MAIL");
    NEW."TLF_ALUMNO"            := COALESCE(NULLIF(NEW."TLF_ALUMNO", ''), OLD."TLF_ALUMNO");
    NEW."TLF_COMUNICACION"      := COALESCE(NULLIF(NEW."TLF_COMUNICACION", ''), OLD."TLF_COMUNICACION");
    NEW."NACIMIENTO"            := COALESCE(NEW."NACIMIENTO", OLD."NACIMIENTO");
    NEW."FOTO"                  := COALESCE(NULLIF(NEW."FOTO", ''), OLD."FOTO");

    -- 3. Datos de los Progenitores / Responsables Legales
    NEW."NOMBRE_MADRE"          := COALESCE(NULLIF(NEW."NOMBRE_MADRE", ''), OLD."NOMBRE_MADRE");
    NEW."TLF_MADRE"             := COALESCE(NULLIF(NEW."TLF_MADRE", ''), OLD."TLF_MADRE");
    NEW."NOMBRE_PADRE"          := COALESCE(NULLIF(NEW."NOMBRE_PADRE", ''), OLD."NOMBRE_PADRE");
    NEW."TLF_PADRE"             := COALESCE(NULLIF(NEW."TLF_PADRE", ''), OLD."TLF_PADRE");

    -- 4. Ubicación y Domicilio
    NEW."DIRECCION"             := COALESCE(NULLIF(NEW."DIRECCION", ''), OLD."DIRECCION");
    NEW."CP"                    := COALESCE(NULLIF(NEW."CP", ''), OLD."CP");

    -- 5. Configuración Económica y Cuotas (Numéricos)
    NEW."DTO_HERMANOS_PORCENTAJE" := COALESCE(NEW."DTO_HERMANOS_PORCENTAJE", OLD."DTO_HERMANOS_PORCENTAJE");
    NEW."AJUSTE_MANUAL_EUR"       := COALESCE(NEW."AJUSTE_MANUAL_EUR", OLD."AJUSTE_MANUAL_EUR");
    NEW."TOTAL_MENSUAL"           := COALESCE(NEW."TOTAL_MENSUAL", OLD."TOTAL_MENSUAL");
    NEW."MOTIVO_AJUSTE"           := NULLIF(btrim(NEW."MOTIVO_AJUSTE"), '');
    NEW."MES_DEVOLUCION_RESERVA"  := COALESCE(NULLIF(NEW."MES_DEVOLUCION_RESERVA", ''), OLD."MES_DEVOLUCION_RESERVA");

    -- 6. Pasarela de Pago y Datos Bancarios
    NEW."METODO_PAGO"           := COALESCE(NULLIF(NEW."METODO_PAGO", ''), OLD."METODO_PAGO");
    NEW."IBAN"                  := COALESCE(NULLIF(NEW."IBAN", ''), OLD."IBAN");
    NEW."TITULAR_CUENTA"        := COALESCE(NULLIF(NEW."TITULAR_CUENTA", ''), OLD."TITULAR_CUENTA");
    NEW."TLF_BIZUM"             := COALESCE(NULLIF(NEW."TLF_BIZUM", ''), OLD."TLF_BIZUM");
    NEW."MANDATO"               := COALESCE(NULLIF(NEW."MANDATO", ''), OLD."MANDATO");
    NEW."TARJETA"               := COALESCE(NULLIF(NEW."TARJETA", ''), OLD."TARJETA");
    NEW."STRIPE_ID"             := COALESCE(NULLIF(NEW."STRIPE_ID", ''), OLD."STRIPE_ID");
    NEW."KOREFACTU_ID"          := COALESCE(NULLIF(NEW."KOREFACTU_ID", ''), OLD."KOREFACTU_ID");

    -- 7. Bloque Exclusivo de Autorizaciones Legales (Booleanos)
    NEW."AUT_MEDIOS"             := COALESCE(NEW."AUT_MEDIOS", OLD."AUT_MEDIOS");
    NEW."AUT_INSTALACIONES"      := COALESCE(NEW."AUT_INSTALACIONES", OLD."AUT_INSTALACIONES");
    NEW."AUT_WEB"                := COALESCE(NEW."AUT_WEB", OLD."AUT_WEB");
    NEW."AUT_RRSS"               := COALESCE(NEW."AUT_RRSS", OLD."AUT_RRSS");
    NEW."AUT_COMUNICACION_TOTAL" := COALESCE(NEW."AUT_COMUNICACION_TOTAL", OLD."AUT_COMUNICACION_TOTAL");

    -- 8. Campos Misceláneos
    NEW."NOTAS"                  := COALESCE(NULLIF(NEW."NOTAS", ''), OLD."NOTAS");

    -- Sincronización nativa de control temporal
    NEW."updated_at"             := CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$function$;

-- Limpieza datos de prueba ESC_018: ajuste 0 con motivo residual
UPDATE public."ALUMNOS"
SET "MOTIVO_AJUSTE" = NULL
WHERE "ID_CLIENTE" = 'ESC_018'
  AND COALESCE("AJUSTE_MANUAL_EUR", 0) = 0
  AND NULLIF(btrim("MOTIVO_AJUSTE"), '') IS NOT NULL;
