// Basic HTML escape
function esc(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Replace {{key}}, {{key|Default}}, and {{{key}}} (raw) using vars.
// Returns { rendered, missing: string[] }
export function renderTemplate(tpl: string, vars: Record<string, any>) {
  // First pass: basic conditionals {{#if path}}...{{/if}}
  // Truthy when value is not null/undefined/empty string/false/0
  const condRe = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  const withConds = tpl.replace(condRe, (_m, path, inner) => {
    const val = lookup(vars, String(path).trim());
    const isTruthy = !(val === null || val === undefined || val === false || val === 0 || String(val) === "");
    return isTruthy ? inner : "";
  });

  const missing = new Set<string>();

  const re = /\{\{\{?\s*([\w\.]+)(?:\|([^}]+))?\s*\}?\}\}/g; // matches {{key}}, {{key|Default}}, {{{key}}}
  const out = withConds.replace(re, (m, path, def) => {
    const raw = m.startsWith("{{{");
    const val = lookup(vars, path);

    if (val === undefined || val === null || String(val) === "") {
      if (def !== undefined) return raw ? String(def) : esc(String(def));
      missing.add(path);
      return "";
    }
    return raw ? String(val) : esc(String(val));
  });

  return { rendered: out, missing: Array.from(missing) };
}

export function renderSubjectAndHtml(
  subjectTpl: string,
  htmlTpl: string,
  vars: Record<string, any>
) {
  const subj = renderTemplate(subjectTpl, vars);
  const html = renderTemplate(htmlTpl, vars);
  return {
    subject: subj.rendered,
    html: html.rendered,
    missing: Array.from(new Set([...subj.missing, ...html.missing]))
  };
}

function lookup(obj: Record<string, any>, path: string) {
  const parts = String(path).split(".").map(p => p.trim()).filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}