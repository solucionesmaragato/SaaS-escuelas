import { useMemo, useState, type ElementType } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FilterMultiSelectOption = {
  id: string;
  name: string;
};

type FilterMultiSelectProps = {
  id?: string;
  label: string;
  icon?: ElementType<{ className?: string }>;
  options: FilterMultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  allLabel: string;
  searchPlaceholder?: string;
  className?: string;
};

export function FilterMultiSelect({
  id,
  label,
  icon: Icon,
  options,
  selected,
  onChange,
  allLabel,
  searchPlaceholder,
  className,
}: FilterMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const triggerLabel = selected.length === 0 ? allLabel : `${label} (${selected.length})`;

  const toggleOption = (optionId: string) => {
    onChange(
      selectedSet.has(optionId)
        ? selected.filter((value) => value !== optionId)
        : [...selected, optionId],
    );
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label
        htmlFor={id}
        className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"
      >
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-9 w-full justify-between px-3 font-normal text-sm"
          >
            <span className="truncate text-left">{triggerLabel}</span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder ?? `Buscar ${label.toLowerCase()}...`} />
            <CommandList>
              <CommandEmpty>Sin resultados.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const checked = selectedSet.has(option.id);
                  return (
                    <CommandItem
                      key={option.id}
                      value={option.name}
                      onSelect={() => toggleOption(option.id)}
                      className="cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        className="mr-2 pointer-events-none"
                        aria-hidden
                      />
                      <span className="truncate flex-1">{option.name}</span>
                      {checked ? <Check className="ml-auto h-3.5 w-3.5 opacity-60" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
