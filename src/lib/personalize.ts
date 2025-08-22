export function renderTemplate(html: string, vars: Record<string, any>) {
  const safe = (v: any) => (v == null || v === "" ? "" : String(v));
  return html
    .replace(/\{\{\s*name\s*\}\}/gi, safe(vars.name))
    .replace(/\{\{\s*email\s*\}\}/gi, safe(vars.email))
    .replace(/\{\{\s*company\s*\}\}/gi, safe(vars.company));
}

