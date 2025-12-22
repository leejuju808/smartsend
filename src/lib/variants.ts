export type Variant = {
  id: string;
  weight: number;
  active: boolean;
  subject?: string | null;
  body: string;
  is_html: boolean;
};

export function pickWeighted(variants: Variant[]): Variant | null {
  const pool = variants.filter((v) => v.active && v.weight > 0);
  if (!pool.length) return null;

  const total = pool.reduce((sum, v) => sum + v.weight, 0);
  let r = Math.random() * total;

  for (const variant of pool) {
    r -= variant.weight;
    if (r <= 0) {
      return variant;
    }
  }

  return pool[pool.length - 1];
}



