export type ReciboDireccionJson = {
  calle: string;
  cp: string;
  municipio: string;
  provincia: string;
};

export function packReciboDireccionJson(fields: ReciboDireccionJson): string {
  return JSON.stringify({
    calle: fields.calle.trim(),
    cp: fields.cp.trim(),
    municipio: fields.municipio.trim(),
    provincia: fields.provincia.trim(),
  });
}

export function parseReciboDireccionJson(
  direccion: string | null | undefined,
): ReciboDireccionJson | null {
  const raw = direccion?.trim() ?? "";
  if (!raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ReciboDireccionJson>;
    return {
      calle: String(parsed.calle ?? "").trim(),
      cp: String(parsed.cp ?? "").trim(),
      municipio: String(parsed.municipio ?? "").trim(),
      provincia: String(parsed.provincia ?? "").trim(),
    };
  } catch {
    return null;
  }
}

export function streetBeforePipe(direccion: string | null | undefined): string {
  const raw = direccion?.trim() ?? "";
  if (!raw || raw.startsWith("{")) return "";
  const pipeIdx = raw.indexOf(" | ");
  return pipeIdx >= 0 ? raw.slice(0, pipeIdx).trim() : raw;
}
