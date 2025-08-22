export function renderTemplate(html: string, vars: Record<string, any>) {
  const safe = (v: any) => (v == null || v === "" ? "" : String(v));
  const fullName = safe(vars.name);
  const first = safe(vars.first_name) || (fullName ? fullName.split(/\s+/)[0] : "");
  const last = safe(vars.last_name) || (fullName ? fullName.split(/\s+/).slice(1).join(" ") : "");
  const company = safe(vars.company);
  const email = safe(vars.email);

  return (html || "")
    .replace(/\{\{\s*name\s*\}\}/gi, first)
    .replace(/\{\{\s*first\s*\}\}/gi, first)
    .replace(/\{\{\s*last\s*\}\}/gi, last)
    .replace(/\{\{\s*company\s*\}\}/gi, company)
    .replace(/\{\{\s*email\s*\}\}/gi, email);
}

