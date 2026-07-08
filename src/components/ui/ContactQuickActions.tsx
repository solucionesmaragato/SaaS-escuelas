import { Mail, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function formatWhatsAppNumber(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function PhoneQuickActions({
  phone,
  variant = "rich",
}: {
  phone: string;
  variant?: "compact" | "rich";
}) {
  const btnClass = variant === "compact" ? "h-7 w-7" : "h-8 w-8";
  const iconClass = variant === "compact" ? "h-3.5 w-3.5" : "h-4 w-4";
  const gapClass = variant === "compact" ? "gap-0" : "gap-0.5";

  return (
    <span className={cn("inline-flex shrink-0 items-center", gapClass)}>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        title="Abrir en WhatsApp"
        className={btnClass}
        onClick={(e) => {
          e.stopPropagation();
          window.open(`https://wa.me/${formatWhatsAppNumber(phone)}`, "_blank", "noopener,noreferrer");
        }}
      >
        <MessageCircle className={cn(iconClass, "text-green-500")} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        title="Llamar"
        className={btnClass}
        onClick={(e) => {
          e.stopPropagation();
          window.location.href = `tel:${phone}`;
        }}
      >
        <Phone className={cn(iconClass, "text-blue-500")} />
      </Button>
    </span>
  );
}

export function EmailQuickAction({
  email,
  variant = "rich",
}: {
  email: string;
  variant?: "compact" | "rich";
}) {
  const btnClass = variant === "compact" ? "h-7 w-7" : "h-8 w-8";
  const iconClass = variant === "compact" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      title="Enviar correo"
      className={cn(btnClass, "shrink-0")}
      onClick={(e) => {
        e.stopPropagation();
        window.location.href = `mailto:${email}`;
      }}
    >
      <Mail className={cn(iconClass, "text-violet-500")} />
    </Button>
  );
}

export function ContactCompactCell({
  phone,
  email,
  align = "start",
  className,
}: {
  phone?: string | null;
  email?: string | null;
  align?: "start" | "end";
  className?: string;
}) {
  const phoneValue = phone?.trim() ?? "";
  const emailValue = email?.trim() ?? "";

  if (!phoneValue && !emailValue) {
    return <span className="text-muted-foreground">—</span>;
  }

  const rowAlign = align === "end" ? "justify-end" : "justify-start";

  return (
    <div
      className={cn("space-y-0.5", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {phoneValue ? (
        <div className={cn("flex items-center gap-1", rowAlign)}>
          <span className="truncate">{phoneValue}</span>
          <PhoneQuickActions phone={phoneValue} variant="compact" />
        </div>
      ) : null}
      {emailValue ? (
        <div className={cn("flex items-center gap-1", rowAlign)}>
          <span className="truncate text-xs text-muted-foreground">{emailValue}</span>
          <EmailQuickAction email={emailValue} variant="compact" />
        </div>
      ) : null}
    </div>
  );
}

export function ContactPhoneRich({ phone }: { phone?: string | null }) {
  const phoneValue = phone?.trim() ?? "";
  if (!phoneValue) return <>—</>;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{phoneValue}</span>
      <PhoneQuickActions phone={phoneValue} variant="rich" />
    </span>
  );
}

export function ContactEmailRich({ email }: { email?: string | null }) {
  const emailValue = email?.trim() ?? "";
  if (!emailValue) return <>—</>;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{emailValue}</span>
      <EmailQuickAction email={emailValue} variant="rich" />
    </span>
  );
}
