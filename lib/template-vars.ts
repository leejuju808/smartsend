// Finds {{var}} and {{{var}}} tokens. If a token has a default via "|", e.g. {{first_name|there}},
// we consider it *not required* because it already falls back.
export type VarToken = { key: string; hasDefault: boolean; raw: string };

export function extractVars(tpl: string): VarToken[] {
  if (!tpl) return [];
  const tokens = new Set<string>();
  const out: VarToken[] = [];
  // triple then double; we treat both the same for requirements
  const re = /\{\{\{([^}]+)\}\}\}|\{\{([^}]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) {
    const expr = (m[1] || m[2] || "").trim();
    if (!expr) continue;
    const [key, def] = expr.split("|").map((s) => s.trim());
    const raw = m[0];
    const id = `${key}|${def ? "1" : "0"}`;
    if (!tokens.has(raw)) {
      tokens.add(raw);
      out.push({ key, hasDefault: !!def, raw });
    }
  }
  return out;
}