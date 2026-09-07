import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Carga variables de .env en la raíz del repo si no están ya definidas. */
export function loadEnvFile(): void {
  if (process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return;
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(scriptDir, "..", ".env");

  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env opcional si las variables ya vienen del entorno
  }

  if (!process.env.SUPABASE_URL?.trim() && process.env.VITE_SUPABASE_URL?.trim()) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL.trim();
  }
}
