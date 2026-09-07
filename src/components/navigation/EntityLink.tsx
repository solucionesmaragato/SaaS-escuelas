import * as React from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type EntityLinkType =
  | "alumno"
  | "profesor"
  | "grupo"
  | "matricula"
  | "aula"
  | "factura"
  | "documento"
  | "fichaje";

export interface EntityLinkProps {
  type: EntityLinkType;
  id?: string | number | null;
  /** Solo para type="fichaje": filtra Control Horario por profesor. */
  profesorId?: string | null;
  children: React.ReactNode;
  className?: string;
}

/**
 * Navigational link that deep-links directly into an entity's detail overlay
 * on its module page, via a route search param (e.g. /alumnos?studentId=...).
 * The target route reads the param on mount and auto-opens the matching overlay.
 */
function stopRowClick(event: React.MouseEvent) {
  event.stopPropagation();
}

export function EntityLink({ type, id, profesorId, children, className }: EntityLinkProps) {
  if (id === undefined || id === null || id === "") {
    return <span className={className}>{children}</span>;
  }

  const linkClassName = cn(
    "font-medium text-primary underline-offset-4 hover:text-brand-hover hover:underline",
    className,
  );
  const entityId = String(id);

  switch (type) {
    case "alumno":
      return (
        <Link
          to="/alumnos"
          search={{ studentId: entityId }}
          className={linkClassName}
          onClick={stopRowClick}
        >
          {children}
        </Link>
      );
    case "profesor":
      return (
        <Link
          to="/profesores"
          search={{ profesorId: entityId }}
          className={linkClassName}
          onClick={stopRowClick}
        >
          {children}
        </Link>
      );
    case "grupo":
      return (
        <Link
          to="/grupos"
          search={{ grupoId: entityId }}
          className={linkClassName}
          onClick={stopRowClick}
        >
          {children}
        </Link>
      );
    case "matricula":
      return (
        <Link
          to="/matriculas"
          search={{ matriculaId: entityId }}
          className={linkClassName}
          onClick={stopRowClick}
        >
          {children}
        </Link>
      );
    case "aula":
      return (
        <Link
          to="/aulas"
          search={{ aulaId: entityId }}
          className={linkClassName}
          onClick={stopRowClick}
        >
          {children}
        </Link>
      );
    case "factura":
      return (
        <Link
          to="/facturas"
          search={{ invoiceId: entityId }}
          className={linkClassName}
          onClick={stopRowClick}
        >
          {children}
        </Link>
      );
    case "documento":
      return (
        <Link
          to="/documentos"
          search={{ documentoId: entityId }}
          className={linkClassName}
          onClick={stopRowClick}
        >
          {children}
        </Link>
      );
    case "fichaje":
      return (
        <Link
          to="/fichajes"
          search={
            profesorId
              ? { fichajeId: entityId, profesorId: String(profesorId) }
              : { fichajeId: entityId }
          }
          className={linkClassName}
          onClick={stopRowClick}
        >
          {children}
        </Link>
      );
    default:
      return <span className={className}>{children}</span>;
  }
}
