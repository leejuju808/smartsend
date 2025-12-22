// Mustache-ish renderer with HTML-escaping and defaults.
// Usage: renderTpl("Hi {{name|there}} from {{company}}", {name:"Ada", company:"AUREV"})
// Escaping is ON by default. Use triple braces to insert unescaped HTML: {{{raw_html}}}

function escapeHtml(s: any) {
  const str = String(s ?? "");
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderTpl(tpl: string, data: Record<string, any>) {
  if (!tpl) return "";
  // triple braces = unescaped
  let out = tpl.replace(/\{\{\{([^}]+)\}\}\}/g, (_, expr) => {
    const [key, def] = String(expr).split("|").map(s => s.trim());
    const val = lookup(data, key);
    return val == null || val === "" ? (def ?? "") : String(val);
  });
  // double braces = escaped
  out = out.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    const [key, def] = String(expr).split("|").map(s => s.trim());
    const val = lookup(data, key);
    const v = val == null || val === "" ? (def ?? "") : String(val);
    return escapeHtml(v);
  });
  return out;
}

// supports nested keys: {{user.name}} → data.user.name
function lookup(obj: Record<string, any>, path: string) {
  if (!path) return "";
  return path.split(".").reduce((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), obj);
}