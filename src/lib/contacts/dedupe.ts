import type { ContactInput } from "./schema";

export function dedupeInMemory(rows: ContactInput[]): ContactInput[] {
  const seen = new Set<string>();
  const out: ContactInput[] = [];
  for (const r of rows) {
    const key = r.email.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ ...r, email: key });
    }
  }
  return out;
} 