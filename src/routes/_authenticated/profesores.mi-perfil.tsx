import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/profesores/mi-perfil")({
  component: () => <Navigate to="/profesores" search={{ tab: "personal" }} replace />,
});
