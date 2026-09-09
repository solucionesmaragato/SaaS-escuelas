/** null, vacío o distinto de INACTIVO → activo (misma regla que usuarios.tsx / SQL). */
export function isPerfilActivo(estado: string | null | undefined): boolean {
  return estado?.trim().toUpperCase() !== "INACTIVO";
}
