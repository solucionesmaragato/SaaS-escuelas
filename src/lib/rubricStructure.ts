export type RubricCriterion = {
  key: string;
  label: string;
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

function parseCriterionItem(item: unknown, index: number): RubricCriterion | null {
  if (typeof item === "string" && item.trim()) {
    const label = item.trim();
    return { key: slugify(label), label };
  }
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;

  const obj = item as Record<string, unknown>;
  const label = String(
    obj.nombre ??
      obj.NOMBRE ??
      obj.name ??
      obj.label ??
      obj.criterio ??
      obj.CRITERIO ??
      "",
  ).trim();
  if (!label) return null;

  const key = String(obj.id ?? obj.ID ?? obj.key ?? obj.KEY ?? slugify(label)).trim();
  return { key: key || slugify(label), label };
}

function parseCriterionArray(items: unknown[]): RubricCriterion[] {
  const criteria: RubricCriterion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const parsed = parseCriterionItem(items[i], i);
    if (!parsed) continue;
    let uniqueKey = parsed.key;
    let suffix = 1;
    while (seen.has(uniqueKey)) {
      uniqueKey = `${parsed.key}_${suffix}`;
      suffix++;
    }
    seen.add(uniqueKey);
    criteria.push({ ...parsed, key: uniqueKey });
  }

  return criteria;
}

export function parseRubricCriteria(
  estructura: Record<string, unknown> | null | undefined,
): RubricCriterion[] {
  if (!estructura) return [];

  if (Array.isArray(estructura)) {
    return parseCriterionArray(estructura);
  }

  const nested = estructura.criterios ?? estructura.criteria ?? estructura.CRITERIOS;
  if (Array.isArray(nested)) {
    return parseCriterionArray(nested);
  }

  const reserved = new Set([
    "criterios",
    "criteria",
    "CRITERIOS",
    "version",
    "nombre",
    "descripcion",
    "descripción",
  ]);

  const objectKeys = Object.keys(estructura).filter((key) => !reserved.has(key));
  if (objectKeys.length > 0) {
    return objectKeys.map((label) => ({ key: slugify(label), label }));
  }

  return [];
}

export function parseResultadosRubrica(
  value: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw == null || raw === "") continue;
    result[key] = String(raw);
  }
  return result;
}

export function buildResultadosRubrica(
  criteria: RubricCriterion[],
  values: Record<string, string>,
): Record<string, number> | null {
  const result: Record<string, number> = {};
  let hasValue = false;

  for (const criterion of criteria) {
    const raw = values[criterion.key]?.trim();
    if (!raw) continue;
    const num = parseFloat(raw);
    if (!Number.isFinite(num)) {
      throw new Error(`Puntuación inválida en "${criterion.label}".`);
    }
    if (num < 0 || num > 10) {
      throw new Error(`"${criterion.label}" debe estar entre 0 y 10.`);
    }
    result[criterion.key] = Math.round(num * 100) / 100;
    hasValue = true;
  }

  return hasValue ? result : null;
}

export function computeNotaMediaFromCriteria(values: Record<string, string>): number | null {
  const nums = Object.values(values)
    .map((value) => parseFloat(value.trim()))
    .filter((num) => Number.isFinite(num));

  if (nums.length === 0) return null;

  const avg = nums.reduce((sum, num) => sum + num, 0) / nums.length;
  return Math.round(avg * 100) / 100;
}

export function isRubricaActiva(estado: string | null | undefined): boolean {
  return (estado ?? "").trim().toLowerCase() === "activa";
}
