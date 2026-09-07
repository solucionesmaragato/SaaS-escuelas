import { useEffect } from "react";
import { AppLogo } from "@/components/AppLogo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoCalBookingPanel } from "@/components/DemoCalComBanner";
import { enforceDemoTrial } from "@/lib/demoTrial";
import type { Perfil } from "@/types/database";

type DemoExpiredWallProps = {
  activePerfil: Perfil;
  onReactivated: () => Promise<void> | Promise<boolean>;
};

export function DemoExpiredWall({ activePerfil, onReactivated }: DemoExpiredWallProps) {
  const calComUrl = (import.meta.env.VITE_CAL_COM_URL as string | undefined)?.trim() ?? "";
  const showCalEmbed = calComUrl.length > 0;

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const result = await enforceDemoTrial(activePerfil.ID_CLIENTE);
        if (cancelled || result.expired) return;
        await onReactivated();
      } catch {
        // Sin loops agresivos: el siguiente intervalo reintenta.
      }
    };

    const timer = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activePerfil.ID_CLIENTE, onReactivated]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4 py-8">
      <Card className="flex w-full max-w-5xl flex-col shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex justify-center">
            <AppLogo onLight className="max-h-20" />
          </div>
          <CardTitle className="text-2xl">Tu prueba ha caducado</CardTitle>
          <CardDescription>Agenda una llamada para reabrir el entorno demo</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          {showCalEmbed ? (
            <DemoCalBookingPanel
              activePerfil={activePerfil}
              namespace="demo-wall-reopen"
              className="min-h-[min(720px,calc(90vh-12rem))]"
              onMeetingConfirmed={() => {
                void onReactivated();
              }}
            />
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Contacta con el equipo de Sincoppa para reactivar tu entorno demo.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
