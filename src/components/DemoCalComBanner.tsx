import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";
import { AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isDemoTenantId } from "@/lib/demoTrial";
import type { Perfil } from "@/types/database";

const DEMO_CAL_SESSION_KEY = "demo_cal_session";
const DEMO_CAL_HAD_SESSION_KEY = "demo_cal_had_session";
const DEMO_CAL_REAL_LOGIN_KEY = "demo_cal_real_login";
const BANNER_DELAY_MS = 90_000;
const CAL_EMBED_NAMESPACE = "demo-booking";
const CAL_EMBED_HEIGHT = "min(720px, calc(90vh - 8rem))";
const MEETING_POLL_INTERVAL_MS = 1_000;
const MEETING_POLL_MAX_ATTEMPTS = 12;

function parseCalLink(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      return url.pathname.replace(/^\/+|\/+$/g, "");
    }
  } catch {
    return trimmed.replace(/^\/+|\/+$/g, "");
  }
  return trimmed.replace(/^\/+|\/+$/g, "");
}

function formatMeetingDayMadrid(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

function formatMeetingTimeMadrid(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function normalizeTlfRealToE164(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;

  const trimmed = raw.trim().replace(/\s+/g, "");
  if (trimmed.startsWith("+")) return trimmed;

  const digitsOnly = trimmed.replace(/\D/g, "");
  if (digitsOnly.length === 9) return `+34${digitsOnly}`;
  if (digitsOnly.startsWith("34") && digitsOnly.length === 11) return `+${digitsOnly}`;
  if (digitsOnly.length > 0) return `+${digitsOnly}`;

  return null;
}

function resolvePrimaryHex(): string {
  if (typeof document === "undefined") return "#1e293b";

  const probe = document.createElement("span");
  probe.className = "bg-primary";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).backgroundColor;
  document.body.removeChild(probe);

  const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return "#1e293b";

  const [, r, g, b] = match;
  return `#${[r, g, b].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

async function fetchDemoMeetingAt(idCliente: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("CLIENTES")
    .select("DEMO_CAL_MEETING_AT")
    .eq("ID_CLIENTE", idCliente)
    .maybeSingle();

  if (error) throw error;
  return data?.DEMO_CAL_MEETING_AT?.trim() ?? null;
}

async function pollMeetingAtAfterBooking(
  idCliente: string,
  onFound: (meetingAt: string) => void,
): Promise<void> {
  for (let attempt = 0; attempt < MEETING_POLL_MAX_ATTEMPTS; attempt++) {
    try {
      const meetingAt = await fetchDemoMeetingAt(idCliente);
      if (meetingAt) {
        onFound(meetingAt);
        return;
      }
    } catch {
      window.location.reload();
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, MEETING_POLL_INTERVAL_MS));
  }

  window.location.reload();
}

function parseBookingStartTimeIso(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const iso = raw.trim();
  if (Number.isNaN(new Date(iso).getTime())) return undefined;
  return iso;
}

function extractStartTimeFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const obj = payload as Record<string, unknown>;
  const fromStartTime = parseBookingStartTimeIso(obj.startTime);
  if (fromStartTime) return fromStartTime;

  const fromStart = parseBookingStartTimeIso(obj.start);
  if (fromStart) return fromStart;

  const fromDate = parseBookingStartTimeIso(obj.date);
  if (fromDate) return fromDate;

  if (obj.booking && typeof obj.booking === "object") {
    const fromBooking = parseBookingStartTimeIso(
      (obj.booking as Record<string, unknown>).startTime,
    );
    if (fromBooking) return fromBooking;
  }

  return undefined;
}

function extractBookingStartTimeIso(event: unknown): string | undefined {
  if (!event || typeof event !== "object") return undefined;

  const root = event as Record<string, unknown>;
  const detail = root.detail;
  const detailObj =
    detail && typeof detail === "object" ? (detail as Record<string, unknown>) : undefined;

  const candidates = [root, detailObj, detailObj?.data, root.data];

  for (const candidate of candidates) {
    const iso = extractStartTimeFromPayload(candidate);
    if (iso) return iso;
  }

  return undefined;
}

function useDemoCalBookingData(
  activePerfil: Perfil,
  enabled: boolean,
  onMeetingConfirmed?: () => void,
) {
  const [tlfReal, setTlfReal] = useState<string | null>(null);
  const [meetingAt, setMeetingAt] = useState<string | null>(null);
  const [bookingLoaded, setBookingLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setBookingLoaded(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("CLIENTES")
        .select("TLF_REAL, DEMO_CAL_MEETING_AT")
        .eq("ID_CLIENTE", activePerfil.ID_CLIENTE)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setBookingLoaded(true);
        return;
      }

      setTlfReal(data?.TLF_REAL ?? null);
      setMeetingAt(data?.DEMO_CAL_MEETING_AT?.trim() ?? null);
      setBookingLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [activePerfil.ID_CLIENTE, enabled]);

  const phoneE164 = useMemo(() => normalizeTlfRealToE164(tlfReal), [tlfReal]);

  const embedConfig = useMemo(() => {
    const config: Record<string, string> = {
      name: activePerfil.NOMBRE,
      email: activePerfil.EMAIL,
      "metadata[App]": "MySincoppa",
      App: "MySincoppa",
      defaultPhoneCountry: "es",
      layout: "month_view",
      theme: "light",
      "ui.autoscroll": "true",
    };
    if (phoneE164) {
      config.attendeePhoneNumber = phoneE164;
      config.phone = phoneE164;
      config.smsReminderNumber = phoneE164;
    }
    return config;
  }, [activePerfil.EMAIL, activePerfil.NOMBRE, phoneE164]);

  const bookingPollStartedRef = useRef(false);
  const meetingConfirmedRef = useRef(false);

  const handleBookingSuccess = useCallback(
    async (startTimeIso?: string) => {
      const optimisticStart = parseBookingStartTimeIso(startTimeIso);
      if (optimisticStart) {
        setMeetingAt(optimisticStart);
        if (!meetingConfirmedRef.current) {
          meetingConfirmedRef.current = true;
          onMeetingConfirmed?.();
        }
      }

      if (bookingPollStartedRef.current) return;
      bookingPollStartedRef.current = true;

      await pollMeetingAtAfterBooking(activePerfil.ID_CLIENTE, (bookedAt) => {
        setMeetingAt(bookedAt);
        if (!meetingConfirmedRef.current) {
          meetingConfirmedRef.current = true;
          onMeetingConfirmed?.();
        }
      });
    },
    [activePerfil.ID_CLIENTE, onMeetingConfirmed],
  );

  return {
    tlfReal,
    meetingAt,
    bookingLoaded,
    phoneE164,
    embedConfig,
    hasBooking: Boolean(meetingAt?.trim()),
    handleBookingSuccess,
  };
}

function DemoCalEmbed({
  calLink,
  config,
  embedKey,
  ready,
  namespace,
  embedHeight = CAL_EMBED_HEIGHT,
  onBookingSuccess,
}: {
  calLink: string;
  config: Record<string, string>;
  embedKey: string;
  ready: boolean;
  namespace: string;
  embedHeight?: string;
  onBookingSuccess?: (startTimeIso?: string) => void;
}) {
  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    (async () => {
      const cal = await getCalApi({ namespace });
      if (cancelled) return;

      const brandHex = resolvePrimaryHex();
      cal("ui", {
        theme: "light",
        hideEventTypeDetails: true,
        layout: "month_view",
        cssVarsPerTheme: {
          light: {
            "cal-brand": brandHex,
            "cal-bg": "#ffffff",
            "cal-bg-emphasis": "#f8fafc",
            "cal-border-booker": "transparent",
            "cal-border-booker-width": "0px",
          },
          dark: {
            "cal-brand": brandHex,
            "cal-bg": "#ffffff",
            "cal-bg-emphasis": "#f8fafc",
            "cal-border-booker": "transparent",
            "cal-border-booker-width": "0px",
          },
        },
      });

      if (!onBookingSuccess) return;

      const handleSuccess = (event: unknown) => {
        void onBookingSuccess(extractBookingStartTimeIso(event));
      };

      cal("on", {
        action: "bookingSuccessfulV2",
        callback: handleSuccess,
      });
      cal("on", {
        action: "bookingSuccessful",
        callback: handleSuccess,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, embedKey, namespace, onBookingSuccess]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-background">
      {ready ? (
        <Cal
          key={embedKey}
          namespace={namespace}
          calLink={calLink}
          config={config}
          style={{
            width: "100%",
            height: embedHeight,
            minHeight: "640px",
            overflow: "auto",
          }}
        />
      ) : null}
    </div>
  );
}

type DemoCalBookingPanelProps = {
  activePerfil: Perfil;
  namespace?: string;
  className?: string;
  embedHeight?: string;
  onMeetingConfirmed?: () => void;
};

export function DemoCalBookingPanel({
  activePerfil,
  namespace = CAL_EMBED_NAMESPACE,
  className,
  embedHeight,
  onMeetingConfirmed,
}: DemoCalBookingPanelProps) {
  const calComUrl = (import.meta.env.VITE_CAL_COM_URL as string | undefined)?.trim() ?? "";
  const calLink = parseCalLink(calComUrl);
  const enabled = isDemoTenantId(activePerfil.ID_CLIENTE) && calLink.length > 0;
  const { bookingLoaded, phoneE164, embedConfig, handleBookingSuccess } = useDemoCalBookingData(
    activePerfil,
    enabled,
    onMeetingConfirmed,
  );
  const embedKey = `${calLink}-${phoneE164 ?? "no-phone"}`;

  if (!enabled) return null;

  return (
    <div className={cn("flex min-h-0 w-full flex-col", className)}>
      <DemoCalEmbed
        calLink={calLink}
        config={embedConfig}
        embedKey={embedKey}
        ready={bookingLoaded}
        namespace={namespace}
        embedHeight={embedHeight}
        onBookingSuccess={handleBookingSuccess}
      />
    </div>
  );
}

type DemoCalComBannerProps = {
  activePerfil: Perfil;
  sessionAccessToken: string | null | undefined;
};

export function DemoCalComBanner({
  activePerfil,
  sessionAccessToken: _sessionAccessToken,
}: DemoCalComBannerProps) {
  const calComUrl = (import.meta.env.VITE_CAL_COM_URL as string | undefined)?.trim() ?? "";
  const calLink = parseCalLink(calComUrl);
  const enabled = isDemoTenantId(activePerfil.ID_CLIENTE) && calLink.length > 0;

  const { meetingAt, bookingLoaded, phoneE164, embedConfig, hasBooking, handleBookingSuccess } =
    useDemoCalBookingData(activePerfil, enabled);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const bookingModalDismissedRef = useRef(false);
  const embedKey = `${calLink}-${phoneE164 ?? "no-phone"}`;

  const handleEmbedBookingSuccess = useCallback(
    async (startTimeIso?: string) => {
      setBookingModalOpen(false);
      setWelcomeModalOpen(false);
      await handleBookingSuccess(startTimeIso);
    },
    [handleBookingSuccess],
  );

  useEffect(() => {
    if (!enabled || !bookingLoaded || hasBooking) return;

    const hadDemoSessionBefore = localStorage.getItem(DEMO_CAL_HAD_SESSION_KEY) === "1";
    const isRealLogin = sessionStorage.getItem(DEMO_CAL_REAL_LOGIN_KEY) === "1";

    if (hadDemoSessionBefore && isRealLogin) {
      setWelcomeModalOpen(true);
      sessionStorage.removeItem(DEMO_CAL_REAL_LOGIN_KEY);
      sessionStorage.setItem(DEMO_CAL_SESSION_KEY, "1");
      return;
    }

    if (isRealLogin) {
      sessionStorage.removeItem(DEMO_CAL_REAL_LOGIN_KEY);
    }

    if (sessionStorage.getItem(DEMO_CAL_SESSION_KEY)) {
      return;
    }

    if (hadDemoSessionBefore) {
      sessionStorage.setItem(DEMO_CAL_SESSION_KEY, "1");
      return;
    }

    const timer = window.setTimeout(() => {
      sessionStorage.setItem(DEMO_CAL_SESSION_KEY, "1");
      localStorage.setItem(DEMO_CAL_HAD_SESSION_KEY, "1");
      if (!bookingModalDismissedRef.current) {
        setBookingModalOpen(true);
      }
    }, BANNER_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, bookingLoaded, hasBooking]);

  useEffect(() => {
    if (hasBooking) {
      setWelcomeModalOpen(false);
      setBookingModalOpen(false);
    }
  }, [hasBooking]);

  if (!enabled) return null;

  return (
    <>
      <div className="ml-auto flex min-w-0 max-w-full shrink items-center">
        {hasBooking && meetingAt ? (
          <span className="inline-flex max-w-[min(100%,28rem)] shrink-0 items-center gap-2 rounded-md border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">
              Reunión agendada el {formatMeetingDayMadrid(meetingAt)} a las{" "}
              {formatMeetingTimeMadrid(meetingAt)}
            </span>
          </span>
        ) : (
          <button
            type="button"
            className="flex min-w-0 max-w-full cursor-pointer items-center gap-3 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-2 text-left shadow-sm transition-colors hover:from-amber-100 hover:to-orange-100"
            onClick={() => setBookingModalOpen(true)}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <AlertTriangle className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-amber-950 sm:text-base">
                Reserva una llamada con Sincoppa
              </span>
              <span className="mt-0.5 block truncate text-xs text-amber-900/80 sm:text-sm">
                Estás en el entorno de prueba. Conócenos y te explicamos todo.
              </span>
            </span>
          </button>
        )}
      </div>

      <Dialog
        open={bookingModalOpen}
        onOpenChange={(open) => {
          setBookingModalOpen(open);
          if (!open) bookingModalDismissedRef.current = true;
        }}
      >
        <DialogContent className="flex h-[90vh] max-h-[90vh] min-h-0 w-full max-w-[calc(100%-2rem)] flex-col gap-4 overflow-hidden sm:max-w-5xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>Agenda tu llamada</DialogTitle>
            <DialogDescription>
              Elige fecha y hora para hablar con el equipo de Sincoppa.
            </DialogDescription>
          </DialogHeader>
          <DemoCalEmbed
            calLink={calLink}
            config={embedConfig}
            embedKey={embedKey}
            ready={bookingLoaded}
            namespace={CAL_EMBED_NAMESPACE}
            onBookingSuccess={handleEmbedBookingSuccess}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={welcomeModalOpen} onOpenChange={setWelcomeModalOpen}>
        <DialogContent className="flex h-[90vh] max-h-[90vh] min-h-0 w-full max-w-[calc(100%-2rem)] flex-col gap-4 overflow-hidden sm:max-w-5xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>Reserva tu llamada de bienvenida</DialogTitle>
            <DialogDescription>
              Tu entorno demo está listo. Elige cuándo quieres que te llamemos.
            </DialogDescription>
          </DialogHeader>
          <DemoCalEmbed
            calLink={calLink}
            config={embedConfig}
            embedKey={embedKey}
            ready={bookingLoaded}
            namespace={CAL_EMBED_NAMESPACE}
            onBookingSuccess={handleEmbedBookingSuccess}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
