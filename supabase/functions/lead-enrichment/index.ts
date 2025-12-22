import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

// Extract domain from email
function extractDomain(email: string): string | null {
  if (!email || !email.includes("@")) return null;
  const parts = email.split("@");
  return parts.length > 1 ? parts[1].toLowerCase() : null;
}

// Enrichment providers (modular design)
async function fetchCompanyData(domain: string): Promise<any> {
  // v1: Basic implementation
  // In v2, this will use micro-scrapers + aggregation
  
  // For now, return basic structure
  // TODO: Integrate with BigPicture API, Clearbit, People Data Labs, etc.
  return {
    name: null,
    domain: domain,
    website: domain ? `https://${domain}` : null,
    industry: null,
    employee_count: null,
    employee_range: null,
    revenue: null,
    founded_year: null,
    tech_stack: [],
  };
}

async function fetchPersonData(email: string, domain: string): Promise<any> {
  // v1: Basic implementation
  // In v2, this will use micro-scrapers + aggregation
  
  // For now, return basic structure
  // TODO: Integrate with BigPicture API, Clearbit, People Data Labs, etc.
  return {
    full_name: null,
    title: null,
    seniority: null,
    linkedin: null,
    city: null,
    state: null,
    country: null,
    timezone: null,
  };
}

async function enrichLead(lead: any) {
  const domain = extractDomain(lead.email) || lead.domain || null;
  
  if (!domain) {
    throw new Error("Cannot extract domain from lead email");
  }

  // Fetch company and person data (parallel)
  const [companyData, personData] = await Promise.all([
    fetchCompanyData(domain),
    fetchPersonData(lead.email, domain),
  ]);

  // Build enrichment record
  const enrichment = {
    lead_id: lead.id,
    first_name: lead.first_name || personData?.first_name || null,
    last_name: lead.last_name || personData?.last_name || null,
    full_name: personData?.full_name || 
               (lead.first_name && lead.last_name ? `${lead.first_name} ${lead.last_name}` : null) ||
               lead.full_name || null,
    title: personData?.title || lead.title || null,
    seniority: personData?.seniority || null,
    linkedin: personData?.linkedin || lead.linkedin || null,
    city: personData?.city || null,
    state: personData?.state || null,
    country: personData?.country || null,
    timezone: personData?.timezone || null,
    company: companyData?.name || lead.company || null,
    domain: domain,
    website: companyData?.website || lead.website || null,
    industry: companyData?.industry || null,
    employee_count: companyData?.employee_count || null,
    employee_range: companyData?.employee_range || null,
    revenue: companyData?.revenue || null,
    founded_year: companyData?.founded_year || null,
    tech_stack: companyData?.tech_stack || [],
    source: "bigpicture", // v1 default, will be configurable in v2
    enriched_at: new Date().toISOString(),
  };

  return enrichment;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { 
        status: 405,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    const { lead } = await req.json();

    if (!lead || !lead.id) {
      return new Response(
        JSON.stringify({ error: "Missing lead" }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Enrich the lead
    const enriched = await enrichLead(lead);

    // Upsert into lead_enrichment table
    const { data, error } = await supabase
      .from("lead_enrichment")
      .upsert(enriched, { onConflict: "lead_id" })
      .select()
      .single();

    if (error) {
      console.error("Failed to upsert enrichment:", error);
      return new Response(
        JSON.stringify({ error: "Failed to save enrichment", details: error.message }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, enrichment: data }),
      {
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    console.error("lead-enrichment error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});



