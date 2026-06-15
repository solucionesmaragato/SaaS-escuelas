export type FichajeComplianceMetadata = {
  IP_FICHAJE: string;
  USER_AGENT: string;
  LATITUD_LONGITUD: string;
};

const IPIFY_URL = "https://api.ipify.org?format=json";
const GEO_TIMEOUT_MS = 3_000;
const IP_TIMEOUT_MS = 5_000;

export function captureUserAgent(): string {
  if (typeof navigator === "undefined" || !navigator.userAgent) {
    return "Desconocido";
  }
  return navigator.userAgent;
}

export function captureGeolocation(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve("Denegado");
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        resolve(`${latitude}, ${longitude}`);
      },
      () => resolve("Denegado"),
      {
        enableHighAccuracy: false,
        timeout: GEO_TIMEOUT_MS,
        maximumAge: 60_000,
      },
    );
  });
}

export async function captureClientIp(): Promise<string> {
  try {
    const response = await fetch(IPIFY_URL, {
      signal: AbortSignal.timeout(IP_TIMEOUT_MS),
    });
    if (!response.ok) return "IP_No_Disponible";
    const data = (await response.json()) as { ip?: string };
    return data.ip?.trim() || "IP_No_Disponible";
  } catch {
    return "IP_No_Disponible";
  }
}

/** Collect eIDAS audit fields immediately before a sealed fichaje insert. */
export async function collectFichajeComplianceMetadata(): Promise<FichajeComplianceMetadata> {
  const [latitudLongitud, ipFichaje] = await Promise.all([
    captureGeolocation(),
    captureClientIp(),
  ]);

  return {
    USER_AGENT: captureUserAgent(),
    LATITUD_LONGITUD: latitudLongitud,
    IP_FICHAJE: ipFichaje,
  };
}
