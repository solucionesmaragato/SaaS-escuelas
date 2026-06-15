import type { SandboxCalendario } from "@/types/database";
import type { EventInput } from "@fullcalendar/core";

const FC_HIDDEN_SUNDAY = 0;
const FC_MONDAY = 1;
const FC_SATURDAY = 6;

export const SANDBOX_SLOT_MIN = "09:00:00";
export const SANDBOX_SLOT_MAX = "22:00:00";

export function formatTimeFromDate(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}:00`;
}

export function isSandboxWeekday(day: number): boolean {
  return day >= FC_MONDAY && day <= FC_SATURDAY;
}

export function dateToSandboxDay(date: Date): number {
  const day = date.getDay();
  if (!isSandboxWeekday(day)) {
    throw new Error("Solo se pueden programar sesiones de lunes a sábado.");
  }
  return day;
}

export function sandboxRowToEvent(row: SandboxCalendario): EventInput | null {
  if (row.DIA == null || !row.HORA_INICIO || !row.HORA_FIN) return null;
  if (!isSandboxWeekday(row.DIA)) return null;

  return {
    id: row.ID_SANDBOX_CALENDARIO,
    title: row.NOMBRE_GRUPO,
    daysOfWeek: [row.DIA],
    startTime: row.HORA_INICIO.slice(0, 8),
    endTime: row.HORA_FIN.slice(0, 8),
    extendedProps: {
      sandboxId: row.ID_SANDBOX_CALENDARIO,
      nombreGrupo: row.NOMBRE_GRUPO,
    },
  };
}

export function rowsToCalendarEvents(rows: SandboxCalendario[]): EventInput[] {
  return rows
    .map(sandboxRowToEvent)
    .filter((event): event is EventInput => event !== null);
}

export { FC_HIDDEN_SUNDAY };
