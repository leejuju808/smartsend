const ALLOWED = new Set(["firstName","lastName","company","title","city","state","email","name"]);

export function findUnknownVars(tpl: string): string[] {
  const vars = new Set<string>();
  tpl.replace(/\{\{\s*([^}|]+?)\s*(?:\|\s*[^}]+?)?\}\}/g, (_, key) => {
    vars.add(String(key).trim());
    return "";
  });
  return [...vars].filter(v => !ALLOWED.has(v));
}

export function lintTemplate(html: string): string[] {
  const warnings: string[] = [];
  if (html.length > 20000) warnings.push("Email is quite long; may reduce deliverability.");
  if (/(free!!!|guarantee|act now|risk-free)/i.test(html)) warnings.push("Avoid spammy phrases.");
  if (/(http:\/\/)/i.test(html)) warnings.push("Use https:// links.");
  return warnings;
}

