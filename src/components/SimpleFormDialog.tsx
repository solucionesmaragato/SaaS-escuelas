import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export type FieldType = "text" | "email" | "tel" | "number" | "date" | "time" | "datetime-local" | "textarea";

export interface FieldDef {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  col?: 1 | 2;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  submitting: boolean;
  fields: FieldDef[];
  initial?: Record<string, unknown> | null;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  footerExtra?: ReactNode;
}

function castValue(v: string, type?: FieldType): unknown {
  if (v === "") return null;
  if (type === "number") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return v;
}

export function SimpleFormDialog({
  open, onClose, title, submitLabel, submitting, fields, initial, onSubmit, footerExtra,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const f of fields) {
      const raw = initial?.[f.name];
      next[f.name] = raw == null ? "" : String(raw);
    }
    setValues(next);
  }, [open, initial, fields]);

  const set = (name: string, v: string) => setValues((p) => ({ ...p, [name]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const payload: Record<string, unknown> = {};
            for (const f of fields) {
              payload[f.name] = castValue(values[f.name] ?? "", f.type);
            }
            void onSubmit(payload);
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.name} className={`space-y-2 ${f.col === 2 || f.type === "textarea" ? "sm:col-span-2" : ""}`}>
                <Label htmlFor={f.name}>
                  {f.label}{f.required ? " *" : ""}
                </Label>
                {f.type === "textarea" ? (
                  <Textarea
                    id={f.name}
                    required={f.required}
                    placeholder={f.placeholder}
                    value={values[f.name] ?? ""}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                ) : (
                  <Input
                    id={f.name}
                    type={f.type ?? "text"}
                    required={f.required}
                    placeholder={f.placeholder}
                    value={values[f.name] ?? ""}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            {footerExtra}
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
