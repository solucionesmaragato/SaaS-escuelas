export type FichajeVinculoTipo = "correccion" | "sustituido";

export type FichajeVinculo = {
  tipo: FichajeVinculoTipo;
  fichajeId: string;
};

const INCIDENCIA_RE = /\[Incidencia:\s*([^\]]+)\]/g;
/** Legacy ventana métricas (pre-unificación formato incidencias). */
const ALERTA_RE = /\[Alerta:\s*([^\]]+)\]/g;
const VINCULO_RE = /\[Vinculo:(correccion|sustituido):([^\]]+)\]/g;

export function parseFichajeIncidencias(notas: string | null | undefined): string[] {
  if (!notas?.trim()) return [];
  const matches: string[] = [];
  for (const match of notas.matchAll(INCIDENCIA_RE)) {
    const text = match[1]?.trim();
    if (text) matches.push(text);
  }
  for (const match of notas.matchAll(ALERTA_RE)) {
    const text = match[1]?.trim();
    if (text) matches.push(text);
  }
  return matches;
}

export function parseFichajeVinculos(notas: string | null | undefined): FichajeVinculo[] {
  if (!notas?.trim()) return [];
  const links: FichajeVinculo[] = [];
  for (const match of notas.matchAll(VINCULO_RE)) {
    const tipo = match[1] as FichajeVinculoTipo | undefined;
    const fichajeId = match[2]?.trim();
    if (tipo && fichajeId) links.push({ tipo, fichajeId });
  }
  return links;
}

export function fichajeHasIncidencias(notas: string | null | undefined): boolean {
  return parseFichajeIncidencias(notas).length > 0 || parseFichajeVinculos(notas).length > 0;
}

export function fichajeVinculoLabel(tipo: FichajeVinculoTipo): string {
  return tipo === "correccion" ? "Corrección de fichaje" : "Sustituido por fichaje";
}
