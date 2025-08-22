export type TemplateCtx = {
  lead?: {
    email: string; name?: string; company?: string;
    custom1?: string; custom2?: string; custom3?: string;
  };
  sender?: { name?: string; email?: string };
  todayISO?: string; // in user's TZ ideally
};

function htmlEscape(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
}
function firstName(s?: string) {
  if (!s) return "";
  const parts = s.trim().split(/\s+/);
  return parts[0] || s;
}
function applyFilter(val: string, f?: string) {
  switch ((f || "").toLowerCase()) {
    case "first":  return firstName(val);
    case "title":  return titleCase(val);
    case "upper":  return val.toUpperCase();
    case "lower":  return val.toLowerCase();
    default:       return val;
  }
}

function lookupVar(key: string, ctx: TemplateCtx): string {
  const k = key.toLowerCase();
  const L = ctx.lead || {};
  const S = ctx.sender || {};
  if (k === "name") return L.name || "";
  if (k === "first_name") return firstName(L.name);
  if (k === "company") return L.company || "";
  if (k === "email") return L.email || "";
  if (k === "custom1") return (L as any).custom1 || "";
  if (k === "custom2") return (L as any).custom2 || "";
  if (k === "custom3") return (L as any).custom3 || "";
  if (k === "sender_name") return S.name || "";
  if (k === "sender_email") return S.email || "";
  if (k === "today") return (ctx.todayISO ? new Date(ctx.todayISO) : new Date()).toLocaleDateString();
  return "";
}

/**
 * Syntax:
 *  {{name}}                        -> lead.name
 *  {{name|first}}                  -> "First"
 *  {{company|upper}}               -> ACME CO
 *  {{name|there}}                  -> fallback ("there") if missing
 *  {{name|first|there}}            -> filter + fallback
 *  {{sender_name}} {{today}}
 */
export function renderTemplate(input: string, ctx: TemplateCtx, { html = true } = {}) {
  if (!input) return input;
  return input.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m, inner: string) => {
    const parts = inner.split("|").map(s => s.trim()).filter(Boolean);
    const varKey = parts[0] || "";
    const filter = parts[1] && !parts[1].includes("@") ? parts[1] : undefined;
    const fallback = parts[parts.length - 1] && parts[parts.length - 1] !== filter ? parts[parts.length - 1] : undefined;

    let val = lookupVar(varKey, ctx);
    if (!val && fallback) val = fallback;
    val = applyFilter(val, filter);
    return html ? htmlEscape(val) : val;
  });
}

export function hasUnresolvedTokens(input: string) {
  return /\{\{[^}]+\}\}/.test(input);
}

