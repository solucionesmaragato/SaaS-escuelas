import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-brand md:text-2xl">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <div
          className="flex w-full flex-col gap-2 md:w-auto md:shrink-0 md:flex-row md:flex-wrap md:items-center [&_a]:w-full md:[&_a]:w-auto [&_button]:w-full md:[&_button]:w-auto"
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
