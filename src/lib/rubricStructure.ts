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
  estructura: Record<string, unknown> | unknown[] | null | undefined,
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
): Record<string, string | number> | null {
  const result: Record<string, string | number> = {};
  let hasValue = false;

  for (const criterion of criteria) {
    const raw = values[criterion.key]?.trim();
    if (!raw) continue;
    const num = Number(raw);
    result[criterion.key] = Number.isFinite(num)
      ? Math.round(num * 100) / 100
      : raw;
    hasValue = true;
  }

  return hasValue ? result : null;
}

export function initCriterioGradeValues(
  criteria: RubricCriterion[],
  saved: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const parsed = parseResultadosRubrica(saved);
  const values: Record<string, string> = {};
  for (const criterion of criteria) {
    const raw = parsed[criterion.key] ?? parsed[criterion.label];
    values[criterion.key] = raw ?? "";
  }
  return values;
}

export function buildResultadosRubricaByLabel(
  criteria: RubricCriterion[],
  values: Record<string, string>,
): Record<string, string | number> | null {
  const byKey = buildResultadosRubrica(criteria, values);
  if (!byKey) return null;

  const result: Record<string, string | number> = {};
  for (const criterion of criteria) {
    if (byKey[criterion.key] != null) {
      result[criterion.label] = byKey[criterion.key];
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Average with 2 decimals only when every non-empty criterion value is numeric. */
export function computeAutoNotaMediaFromCriteria(
  values: Record<string, string>,
): string | null {
  const nonEmpty = Object.values(values)
    .map((value) => value.trim())
    .filter((value) => value !== "");
  if (nonEmpty.length === 0) return null;

  const nums: number[] = [];
  for (const val of nonEmpty) {
    const num = Number(val);
    if (!Number.isFinite(num)) return null;
    nums.push(num);
  }

  const avg = nums.reduce((sum, num) => sum + num, 0) / nums.length;
  return avg.toFixed(2);
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

export type RubricaEstructuraItem = { criterio: string };

export function buildEstructuraFromCriterionNames(
  names: string[],
): RubricaEstructuraItem[] {
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .map((criterio) => ({ criterio }));
}

export function criterionNamesFromEstructura(
  estructura: Record<string, unknown> | unknown[] | null | undefined,
): string[] {
  if (!estructura) return [];
  return parseRubricCriteria(estructura).map((c) => c.label);
}
