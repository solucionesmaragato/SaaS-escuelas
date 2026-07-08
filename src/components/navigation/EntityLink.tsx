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
  | "documento";

export interface EntityLinkProps {
  type: EntityLinkType;
  id?: string | number | null;
  children: React.ReactNode;
  className?: string;
}

/**
 * Navigational link that deep-links directly into an entity's detail overlay
 * on its module page, via a route search param (e.g. /alumnos?studentId=...).
 * The target route reads the param on mount and auto-opens the matching overlay.
 */
export function EntityLink({ type, id, children, className }: EntityLinkProps) {
  if (id === undefined || id === null || id === "") {
    return <span className={className}>{children}</span>;
  }

  const linkClassName = cn("font-medium text-primary hover:underline", className);
  const entityId = String(id);

  switch (type) {
    case "alumno":
      return (
        <Link to="/alumnos" search={{ studentId: entityId }} className={linkClassName}>
          {children}
        </Link>
      );
    case "profesor":
      return (
        <Link to="/profesores" search={{ profesorId: entityId }} className={linkClassName}>
          {children}
        </Link>
      );
    case "grupo":
      return (
        <Link to="/grupos" search={{ grupoId: entityId }} className={linkClassName}>
          {children}
        </Link>
      );
    case "matricula":
      return (
        <Link to="/matriculas" search={{ matriculaId: entityId }} className={linkClassName}>
          {children}
        </Link>
      );
    case "aula":
      return (
        <Link to="/aulas" search={{ aulaId: entityId }} className={linkClassName}>
          {children}
        </Link>
      );
    case "factura":
      return (
        <Link to="/facturas" search={{ invoiceId: entityId }} className={linkClassName}>
          {children}
        </Link>
      );
    case "documento":
      return (
        <Link to="/documentos" search={{ documentoId: entityId }} className={linkClassName}>
          {children}
        </Link>
      );
    default:
      return <span className={className}>{children}</span>;
  }
}
