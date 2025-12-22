export type MergeCtx = Record<string, string | number | null | undefined>;

/**
 * Supported:
 *  - {{firstName}} => ctx.firstName
 *  - {{firstName|there}} => fallback "there"
 *  - Trims spaces inside tags.
 *  - Escapes nothing (expects safe HTML in body_html).
 */
export function renderTemplate(tpl: string, ctx: MergeCtx = {}): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]+?)\s*)?\}\}/g, (_, rawKey: string, rawFallback?: string) => {
    const key = rawKey.trim();
    const fallback = (rawFallback ?? "").trim();
    const val = ctx[key];
    const s = (val === null || val === undefined || String(val).trim() === "") ? fallback : String(val);
    return s ?? "";
  });
}

/** Convenience helpers for common fields */
export function leadCtx(lead: {
  first_name?: string|null;
  last_name?: string|null;
  company?: string|null;
  title?: string|null;
  city?: string|null;
  state?: string|null;
  email?: string|null;
  // Enrichment fields (can be passed from lead_enrichment)
  full_name?: string|null;
  seniority?: string|null;
  linkedin?: string|null;
  country?: string|null;
  timezone?: string|null;
  domain?: string|null;
  website?: string|null;
  industry?: string|null;
  employee_count?: number|null;
  employee_range?: string|null;
  revenue?: string|null;
  founded_year?: number|null;
  tech_stack?: string[]|null;
}): MergeCtx {
  const firstName = lead.first_name?.trim() || (lead.email ? lead.email.split("@")[0] : "");
  return {
    firstName,
    lastName: lead.last_name ?? "",
    company: lead.company ?? "",
    title: lead.title ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    email: lead.email ?? "",
    name: [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || firstName,
    // Enrichment fields
    full_name: lead.full_name ?? "",
    seniority: lead.seniority ?? "",
    linkedin: lead.linkedin ?? "",
    country: lead.country ?? "",
    timezone: lead.timezone ?? "",
    domain: lead.domain ?? "",
    website: lead.website ?? "",
    industry: lead.industry ?? "",
    employee_count: lead.employee_count?.toString() ?? "",
    employee_range: lead.employee_range ?? "",
    revenue: lead.revenue ?? "",
    founded_year: lead.founded_year?.toString() ?? "",
    tech_stack: lead.tech_stack?.join(", ") ?? "",
  } as MergeCtx;
}

