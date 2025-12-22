import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getResearchTokens } from "@/lib/research-tokens";

export async function getLeadContext(lead_id: string) {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("email, first_name, last_name, company, title, custom")
    .eq("id", lead_id)
    .maybeSingle();

  // Fetch enrichment data
  const { data: enrichment } = await supabaseAdmin
    .from("lead_enrichment")
    .select("*")
    .eq("lead_id", lead_id)
    .maybeSingle();

  // Fetch research data (Block 469 - AI Research Agent)
  const researchTokens = await getResearchTokens(lead_id).catch(() => ({}));

  const ctx = {
    lead: { email: "", first_name: "", last_name: "", company: "", title: "", ...lead },
    // flatten common keys for convenience
    email: lead?.email ?? "",
    first_name: lead?.first_name ?? enrichment?.first_name ?? "",
    last_name: lead?.last_name ?? enrichment?.last_name ?? "",
    company: lead?.company ?? enrichment?.company ?? "",
    title: lead?.title ?? enrichment?.title ?? "",
    custom: lead?.custom ?? {},
    // Enrichment fields
    full_name: enrichment?.full_name ?? "",
    seniority: enrichment?.seniority ?? "",
    linkedin: enrichment?.linkedin ?? "",
    city: enrichment?.city ?? "",
    state: enrichment?.state ?? "",
    country: enrichment?.country ?? "",
    timezone: enrichment?.timezone ?? "",
    domain: enrichment?.domain ?? "",
    website: enrichment?.website ?? "",
    industry: enrichment?.industry ?? "",
    employee_count: enrichment?.employee_count ?? "",
    employee_range: enrichment?.employee_range ?? "",
    revenue: enrichment?.revenue ?? "",
    founded_year: enrichment?.founded_year ?? "",
    tech_stack: enrichment?.tech_stack?.join(", ") ?? "",
    // Research Agent tokens (Block 469)
    company_summary: researchTokens.company_summary ?? "",
    pain_point: researchTokens.pain_point ?? "",
    geo_snippet: researchTokens.geo_snippet ?? "",
    personalization_line: researchTokens.personalization_line ?? "",
    competitor_reference: researchTokens.competitor_reference ?? "",
    tech_stack_note: researchTokens.tech_stack_note ?? "",
  };
  return ctx;
}