import { createFileRoute } from "@tanstack/react-router";
import { RubricasAdminView } from "@/components/rubricas/RubricasAdminView";

export const Route = createFileRoute("/_authenticated/rubricas")({
  component: RubricasPage,
});

function RubricasPage() {
  return <RubricasAdminView />;
}
