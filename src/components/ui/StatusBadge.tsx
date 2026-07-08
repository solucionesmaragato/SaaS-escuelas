import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusBadgeVariant =
  | "success"
  | "warning"
  | "destructive"
  | "pending"
  | "info"
  | "neutral";

const STATUS_BADGE_CLASSES: Record<StatusBadgeVariant, string> = {
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  destructive: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusBadgeVariant;
  children: React.ReactNode;
}

export function StatusBadge({ status, className, children, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_BADGE_CLASSES[status],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
