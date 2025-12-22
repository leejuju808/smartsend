/**
 * Micro-mustache: replaces {{key}} with values from context (no logic/loops).
 * Safe and tiny for subject/body personalization.
 */
export function renderTemplate(tpl: string, ctx: Record<string, any>): string {
  return tpl.replace(/{{\s*([\w.]+)\s*}}/g, (_, path) => {
    const parts = String(path).split(".");
    let cur: any = ctx;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in cur) cur = cur[p];
      else return "";
    }
    return cur == null ? "" : String(cur);
  });
}