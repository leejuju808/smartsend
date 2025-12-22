export type Vars = Record<string, string | null | undefined>;

export function renderTemplate(tpl: string, vars: Vars) {
  // {{name}} → value, fallback {{name|there}}
  return tpl.replace(/\{\{\s*([\w.]+)(?:\|([^}]+))?\s*\}\}/g, (_m, key, fallback) => {
    const v = (vars[key] ?? "").toString().trim();
    return v || (fallback ?? "");
  });
}

export function countTokens(s: string) {
  // rough ~4 chars/token heuristic
  return Math.ceil((s || "").length / 4);
}
