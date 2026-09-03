import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ES_DATE_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

/** Canonical business timezone (península / Baleares). */
export const SCHOOL_TIMEZONE = "Europe/Madrid";

function madridNow(): TZDate {
  return TZDate.tz(SCHOOL_TIMEZONE);
}

/** Today's calendar date in Europe/Madrid as YYYY-MM-DD. */
export function madridTodayDateKey(): string {
  return format(madridNow(), "yyyy-MM-dd");
}

/** First day of the current month in Europe/Madrid as YYYY-MM-DD. */
export function madridMonthStartDateKey(): string {
  return `${format(madridNow(), "yyyy-MM")}-01`;
}

/** @deprecated Use {@link madridTodayDateKey} — business dates use Europe/Madrid. */
export function todayIsoDateLocal(): string {
  return madridTodayDateKey();
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

function toIsoFromParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parses flexible user input into ISO YYYY-MM-DD.
 * Returns "" for empty input, null when invalid.
 */
export function parseFlexibleDateToIso(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return "";

  if (ISO_DATE_RE.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    if (!isRealDate(year, month, day)) return null;
    return toIsoFromParts(year, month, day);
  }

  const esMatch = trimmed.match(ES_DATE_RE);
  if (esMatch) {
    const day = Number(esMatch[1]);
    const month = Number(esMatch[2]);
    const year = Number(esMatch[3]);
    if (!isRealDate(year, month, day)) return null;
    return toIsoFromParts(year, month, day);
  }

  return null;
}

/** Formats ISO YYYY-MM-DD for Spanish text entry (DD/MM/AAAA). */
export function isoToDisplayEs(iso: string): string {
  const trimmed = iso.trim();
  if (trimmed === "") return "";
  if (!ISO_DATE_RE.test(trimmed)) return trimmed;

  const [year, month, day] = trimmed.split("-");
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
}
