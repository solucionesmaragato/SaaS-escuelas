import { Link } from "@tanstack/react-router";
import {
  Calendar,
  Clock,
  Users,
  AlertTriangle,
  GraduationCap,
  School,
  Package,
  FileCheck,
  FolderLock,
  HardDrive,
  UserCog,
  Hourglass,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

type ColorScheme = "green" | "yellow" | "blue" | "red";

interface MenuItem {
  title: string;
  icon: LucideIcon;
  colorScheme: ColorScheme;
  to?: string;
  search?: Record<string, string>;
  disabled?: boolean;
}

const ICON_BADGE_CLASSES: Record<ColorScheme, string> = {
  green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 border border-emerald-100",
  yellow: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 border border-amber-100",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/30 border border-blue-100",
  red: "bg-red-50 text-red-600 dark:bg-red-950/30 border border-red-100",
};

const LABEL_CLASSES: Record<ColorScheme, string> = {
  green: "text-emerald-700 dark:text-emerald-400",
  yellow: "text-amber-700 dark:text-amber-400",
  blue: "text-blue-700 dark:text-blue-400",
  red: "text-red-700 dark:text-red-400",
};

// BLOCK 1: GREEN (Academic & Logistics)
// BLOCK 2: YELLOW (Time, Clearances & Docs)
// BLOCK 3: BLUE (Identity & Students)
// BLOCK 4: RED (Critical Alerts)
const MENU_ITEMS: MenuItem[] = [
  { title: "Sesiones", icon: Calendar, colorScheme: "green", to: "/sesiones" },
  { title: "Grupos", icon: School, colorScheme: "green", to: "/grupos" },
  { title: "Evaluaciones", icon: GraduationCap, colorScheme: "green", to: "/evaluaciones" },
  { title: "Préstamos de material", icon: Package, colorScheme: "green", to: "/prestamosMaterial" },
  { title: "Fichajes", icon: Clock, colorScheme: "yellow", to: "/fichajes" },
  { title: "Permisos", icon: FileCheck, colorScheme: "yellow", to: "/ausencias" },
  { title: "Disponibilidad horaria", icon: Hourglass, colorScheme: "yellow", to: "/turnos" },
  { title: "Documentos legales", icon: FolderLock, colorScheme: "yellow", to: "/documentos" },
  { title: "Mis archivos", icon: HardDrive, colorScheme: "yellow", disabled: true },
  { title: "Alumnos", icon: Users, colorScheme: "blue", to: "/alumnos" },
  {
    title: "Mis datos personales",
    icon: UserCog,
    colorScheme: "blue",
    to: "/profesores",
    search: { tab: "personal" },
  },
  { title: "Incidencias", icon: AlertTriangle, colorScheme: "red", to: "/incidencias" },
];

function MenuCard({ item }: { item: MenuItem }) {
  const Icon = item.icon;
  const schemeClasses = ICON_BADGE_CLASSES[item.colorScheme];
  const labelClasses = LABEL_CLASSES[item.colorScheme];

  const content = (
    <Card
      className={cn(
        "flex aspect-square h-full flex-col items-center justify-center border-border bg-background p-3 text-center shadow-sm transition-transform",
        item.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer active:scale-95",
      )}
    >
      <div
        className={cn(
          "mb-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
          schemeClasses,
        )}
      >
        <Icon className="h-6 w-6 stroke-[2.5]" strokeWidth={2.5} />
      </div>
      <span className={cn("text-xs font-medium leading-tight", labelClasses)}>{item.title}</span>
    </Card>
  );

  if (item.disabled || !item.to) {
    return <div className="contents">{content}</div>;
  }

  return (
    <Link to={item.to} search={item.search as never}>
      {content}
    </Link>
  );
}

export function ProfesorMobileMenuGrid() {
  return (
    <div className="px-4 py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {MENU_ITEMS.map((item) => (
          <MenuCard key={item.title} item={item} />
        ))}
      </div>
    </div>
  );
}
