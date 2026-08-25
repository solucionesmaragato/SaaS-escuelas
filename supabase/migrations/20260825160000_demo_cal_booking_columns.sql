-- Demo Cal.com: estado de cita en CLIENTES (convención DEMO-*; columnas nullable).

ALTER TABLE public."CLIENTES"
  ADD COLUMN IF NOT EXISTS "DEMO_CAL_MEETING_AT" timestamptz NULL,
  ADD COLUMN IF NOT EXISTS "DEMO_CAL_BOOKING_UID" text NULL;

COMMENT ON COLUMN public."CLIENTES"."DEMO_CAL_MEETING_AT" IS
  'Demo: inicio de la reunión (startTime del booking Cal.com).';

COMMENT ON COLUMN public."CLIENTES"."DEMO_CAL_BOOKING_UID" IS
  'Demo: uid del booking Cal.com (idempotencia).';
