import { Mail, MessageCircle, Phone } from "lucide-react";
import type { AlumnoTree } from "@/hooks/useAlumnosTree";
import { formatPhoneForWhatsApp } from "@/lib/alumnosMatriculasUtils";
import { Button } from "@/components/ui/button";

export function AlumnoQuickActions({ alumno }: { alumno: AlumnoTree }) {
  const waPhone = formatPhoneForWhatsApp(alumno.TLF_COMUNICACION);

  return (
    <div className="flex items-center justify-end gap-0.5 sm:gap-1">
      {waPhone ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
          asChild
        >
          <a
            href={`https://wa.me/${waPhone}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            onClick={(e) => e.stopPropagation()}
          >
            <MessageCircle className="h-4 w-4" />
          </a>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled
          aria-label="WhatsApp"
          onClick={(e) => e.stopPropagation()}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      )}

      {alumno.MAIL ? (
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <a
            href={`mailto:${alumno.MAIL}`}
            aria-label="Email"
            onClick={(e) => e.stopPropagation()}
          >
            <Mail className="h-4 w-4" />
          </a>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled
          aria-label="Email"
          onClick={(e) => e.stopPropagation()}
        >
          <Mail className="h-4 w-4" />
        </Button>
      )}

      {alumno.TLF_COMUNICACION ? (
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <a
            href={`tel:${alumno.TLF_COMUNICACION}`}
            aria-label="Llamar"
            onClick={(e) => e.stopPropagation()}
          >
            <Phone className="h-4 w-4" />
          </a>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled
          aria-label="Llamar"
          onClick={(e) => e.stopPropagation()}
        >
          <Phone className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
