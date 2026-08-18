import { createFileRoute } from "@tanstack/react-router";
import { ProfesorMobileMenuGrid } from "@/components/dashboard/ProfesorMobileMenuGrid";

export const Route = createFileRoute("/_authenticated/app/")({
  component: ProfesorAppHomePage,
});

function ProfesorAppHomePage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <ProfesorMobileMenuGrid />
    </div>
  );
}
