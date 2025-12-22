// lib/validators/leads.ts

export function normalizeEmail(v: any): string | undefined {
  if (!v) return undefined;
  const s = String(v).trim().toLowerCase();
  if (!/.+@.+\..+/.test(s)) return undefined;
  return s;
}

export function normalizePhone(v: any): string | undefined {
  if (!v) return undefined;
  const s = String(v).replace(/[^0-9]/g, "");
  if (s.length < 7) return undefined;
  return s;
}

