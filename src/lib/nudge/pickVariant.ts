export type Variant = {
  variant_id: string;
  name: string;
  weight: number;
  subject?: string | null;
  body_html?: string | null;
  body_text?: string | null;
};

function normalizeWeight(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return num;
}

function seededRandom(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return (hash % 10000) / 10000;
}

export function pickVariant(variants: Variant[], seed?: string): Variant | null {
  if (!Array.isArray(variants) || variants.length === 0) {
    return null;
  }

  const normalized = variants.map((variant) => ({
    ...variant,
    weight: normalizeWeight(variant.weight),
  }));

  const totalWeight = normalized.reduce((total, variant) => total + variant.weight, 0);
  if (totalWeight <= 0) {
    return normalized[0] ?? null;
  }

  let random = Math.random();
  if (seed) {
    random = seededRandom(seed);
  }

  let cumulative = 0;
  for (const variant of normalized) {
    cumulative += variant.weight / totalWeight;
    if (random <= cumulative) {
      return variant;
    }
  }

  return normalized.at(-1) ?? null;
}

