import { CLOCK_MOVEMENT_TYPES, isCorrectionMovement } from "@/lib/fichajeEidas";

export type ProfesorDashboardBucket = "en_clase" | "ocupado" | "libre" | "alerta_grave";

export type FichajeClockRecord = {
  ID_PROFESOR: string;
  TIPO_MOVIMIENTO: string | null;
  FECHA_HORA_REAL: string;
};

export type ClassifyProfesorDashboardInput = {
  hasActiveSession: boolean;
  lastClockMovement: string | null;
};

export type ClassifyProfesorDashboardResult = {
  bucket: ProfesorDashboardBucket;
  hasActiveSession: boolean;
  lastClockMovement: string | null;
  isActivelyClockedIn: boolean;
};

export { CLOCK_MOVEMENT_TYPES };

export function normalizeMovimiento(tipo: string | null | undefined): string {
  return (tipo ?? "").trim();
}

export function isClockMovement(tipo: string | null | undefined): boolean {
  return CLOCK_MOVEMENT_TYPES.has(normalizeMovimiento(tipo));
}

export function isActivelyClockedIn(lastMovement: string | null): boolean {
  if (!lastMovement) return false;
  const normalized = normalizeMovimiento(lastMovement);
  if (!isClockMovement(normalized)) return false;
  return normalized !== "Salida";
}

export function getLastClockMovement(records: FichajeClockRecord[]): string | null {
  const sorted = [...records].sort((a, b) => b.FECHA_HORA_REAL.localeCompare(a.FECHA_HORA_REAL));

  for (const record of sorted) {
    if (isCorrectionMovement(record.TIPO_MOVIMIENTO)) continue;
    const normalized = normalizeMovimiento(record.TIPO_MOVIMIENTO);
    if (isClockMovement(normalized)) return normalized;
  }

  return null;
}

export function classifyProfesorDashboardLive(
  input: ClassifyProfesorDashboardInput,
): ClassifyProfesorDashboardResult {
  const activelyClockedIn = isActivelyClockedIn(input.lastClockMovement);

  let bucket: ProfesorDashboardBucket;
  if (input.hasActiveSession && activelyClockedIn) {
    bucket = "en_clase";
  } else if (input.hasActiveSession && !activelyClockedIn) {
    bucket = "ocupado";
  } else if (!input.hasActiveSession && !activelyClockedIn) {
    bucket = "libre";
  } else {
    bucket = "alerta_grave";
  }

  return {
    bucket,
    hasActiveSession: input.hasActiveSession,
    lastClockMovement: input.lastClockMovement,
    isActivelyClockedIn: activelyClockedIn,
  };
}

export function buildLastClockMovementByProfesor(
  records: FichajeClockRecord[],
): Map<string, string | null> {
  const byProfesor = new Map<string, FichajeClockRecord[]>();

  for (const record of records) {
    const list = byProfesor.get(record.ID_PROFESOR);
    if (list) {
      list.push(record);
    } else {
      byProfesor.set(record.ID_PROFESOR, [record]);
    }
  }

  const result = new Map<string, string | null>();
  for (const [profesorId, profRecords] of byProfesor) {
    result.set(profesorId, getLastClockMovement(profRecords));
  }
  return result;
}
