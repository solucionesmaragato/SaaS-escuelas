export const MESES_ANIO = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export const METODOS_PAGO = ["BIZUM", "Efectivo", "SEPA", "Tarjeta"] as const;

export function formatPhoneForWhatsApp(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

export function calcAgeFromBirth(nacimiento: string | null | undefined): number | null {
  if (!nacimiento) return null;
  const birth = new Date(nacimiento);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function formatNacimientoConEdad(nacimiento: string | null | undefined): string {
  if (!nacimiento) return "—";
  const age = calcAgeFromBirth(nacimiento);
  return age != null ? `${nacimiento} (${age} años)` : nacimiento;
}

export function isEstadoActivo(estado: string | null | undefined): boolean {
  if (!estado) return false;
  const v = estado.toUpperCase();
  return v === "ACTIVO" || v === "ON" || v === "SI" || v === "SÍ" || v === "TRUE" || v === "1";
}

export function estadoFromToggle(checked: boolean): string {
  return checked ? "ACTIVO" : "INACTIVO";
}

/** Orden alfabético (español), insensible a mayúsculas y acentos. */
export function compareAlphabetic(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base" });
}

export function sortAlphabetic<T>(items: T[], getLabel: (item: T) => string): T[] {
  return [...items].sort((x, y) =>
    compareAlphabetic(getLabel(x) || "", getLabel(y) || ""),
  );
}

export function initialsFromName(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
