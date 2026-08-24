const STORAGE_KEY = "demo_registro_form";

export interface DemoRegistroForm {
  nombre: string;
  telefono: string;
  email: string;
}

export function saveDemoRegistroForm(form: DemoRegistroForm): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form));
}

export function readDemoRegistroForm(): DemoRegistroForm | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DemoRegistroForm;
    if (!parsed.nombre?.trim() || !parsed.telefono?.trim() || !parsed.email?.trim()) return null;
    return {
      nombre: parsed.nombre.trim(),
      telefono: parsed.telefono.trim(),
      email: parsed.email.trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

export function clearDemoRegistroForm(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function validateDemoRegistroForm(form: DemoRegistroForm): string | null {
  if (form.nombre.trim().length < 2) return "Introduce tu nombre y apellidos.";
  const digits = form.telefono.replace(/\D/g, "");
  if (digits.length < 9) return "Introduce un teléfono válido (mínimo 9 dígitos).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return "Introduce un correo electrónico válido.";
  }
  return null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
