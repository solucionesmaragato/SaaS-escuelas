"use client";

import { useEffect, useMemo, useState } from "react";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { Matcher } from "react-day-picker";
import { toast } from "sonner";

import { isoToDisplayEs, parseFlexibleDateToIso } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function isIsoInRange(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

function rangeErrorMessage(min?: string, max?: string): string {
  if (min && max) {
    return `La fecha debe estar entre ${isoToDisplayEs(min)} y ${isoToDisplayEs(max)}.`;
  }
  if (min) {
    return `La fecha debe ser posterior o igual a ${isoToDisplayEs(min)}.`;
  }
  if (max) {
    return `La fecha debe ser anterior o igual a ${isoToDisplayEs(max)}.`;
  }
  return "La fecha está fuera del rango permitido.";
}

export type DateFieldProps = {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  className?: string;
  /** Inclusive minimum date (ISO YYYY-MM-DD). */
  min?: string;
  /** Inclusive maximum date (ISO YYYY-MM-DD). */
  max?: string;
  /** Called after a text commit succeeds or reverts (e.g. react-hook-form blur). */
  onBlur?: () => void;
};

export function DateField({
  value,
  onChange,
  disabled,
  id,
  placeholder = "DD/MM/AAAA",
  className,
  min,
  max,
  onBlur,
}: DateFieldProps) {
  const [draft, setDraft] = useState(() => isoToDisplayEs(value));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setDraft(isoToDisplayEs(value));
  }, [value]);

  const disabledDays = useMemo((): Matcher[] | undefined => {
    const matchers: Matcher[] = [];
    if (min) {
      const minDate = parse(min, "yyyy-MM-dd", new Date());
      if (isValid(minDate)) matchers.push({ before: minDate });
    }
    if (max) {
      const maxDate = parse(max, "yyyy-MM-dd", new Date());
      if (isValid(maxDate)) matchers.push({ after: maxDate });
    }
    return matchers.length > 0 ? matchers : undefined;
  }, [min, max]);

  const commit = () => {
    const parsed = parseFlexibleDateToIso(draft);
    if (parsed === null) {
      toast.error("Fecha no válida. Usa DD/MM/AAAA.");
      setDraft(isoToDisplayEs(value));
      onBlur?.();
      return;
    }
    if (parsed !== "" && !isIsoInRange(parsed, min, max)) {
      toast.error(rangeErrorMessage(min, max));
      setDraft(isoToDisplayEs(value));
      onBlur?.();
      return;
    }
    if (parsed !== value) {
      onChange(parsed);
    } else {
      setDraft(isoToDisplayEs(parsed));
    }
    onBlur?.();
  };

  const selectedDate = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const calendarSelected =
    selectedDate && isValid(selectedDate) ? selectedDate : undefined;

  return (
    <div className={cn("flex min-w-0 gap-1", className)}>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className="min-w-0 flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            disabled={disabled}
            aria-label="Abrir calendario"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={calendarSelected}
            defaultMonth={calendarSelected ?? new Date()}
            disabled={disabledDays}
            onSelect={(date) => {
              if (!date) return;
              const iso = format(date, "yyyy-MM-dd");
              if (!isIsoInRange(iso, min, max)) {
                toast.error(rangeErrorMessage(min, max));
                return;
              }
              onChange(iso);
              setDraft(isoToDisplayEs(iso));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
