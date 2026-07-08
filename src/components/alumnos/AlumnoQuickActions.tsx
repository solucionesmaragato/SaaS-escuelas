import type { AlumnoTree } from "@/hooks/useAlumnosTree";
import { ContactCompactCell } from "@/components/ui/ContactQuickActions";

export function AlumnoQuickActions({ alumno }: { alumno: AlumnoTree }) {
  return (
    <ContactCompactCell
      phone={alumno.TLF_COMUNICACION}
      email={alumno.MAIL}
      align="end"
    />
  );
}
