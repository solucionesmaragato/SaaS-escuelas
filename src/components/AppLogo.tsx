import { MYSINCOPPA_APP_NAME, MYSINCOPPA_LOGO_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";

type AppLogoProps = {
  className?: string;
  variant?: "default" | "compact";
  /** Mejora contraste del PNG con fondo negro sobre cards claras. */
  onLight?: boolean;
};

export function AppLogo({ className, variant = "default", onLight = false }: AppLogoProps) {
  const img = (
    <img
      src={MYSINCOPPA_LOGO_URL}
      alt={MYSINCOPPA_APP_NAME}
      className={cn(
        "h-auto w-auto object-contain",
        variant === "compact" ? "max-h-10" : "max-h-16",
        className,
      )}
      loading="eager"
      decoding="async"
    />
  );

  if (!onLight) return img;

  return <div className="inline-flex rounded-xl bg-neutral-950 px-4 py-3">{img}</div>;
}
