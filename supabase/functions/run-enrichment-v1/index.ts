import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.58.1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

/**
 * Extract domain from email or website
 */
function extractDomain(email?: string, website?: string): string | null {
  if (website) {
    try {
      const url = website.startsWith("http") ? website : `https://${website}`;
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      // If URL parsing fails, try to clean it manually
      const cleaned = website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      return cleaned.toLowerCase();
    }
  }
  
  if (email && email.includes("@")) {
    return email.split("@")[1].toLowerCase();
  }
  
  return null;
}

/**
 * Calculate enrichment health score based on available fields
 */
function calculateEnrichmentScore(lead: any, enrichmentData: any): number {
  let score = 0;
  
  // Base: email only = 0
  if (!lead.email) return 0;
  
  // +20: email + first name
  if (lead.first_name) score += 20;
  
  // +20: + company
  if (lead.company || enrichmentData?.company?.name) score += 20;
  
  // +20: + domain
  if (lead.domain || enrichmentData?.company?.domain) score += 20;
  
  // +20: + industry
  if (lead.industry || enrichmentData?.company?.industry) score += 20;
  
  // +20: + size + location
  if ((lead.company_size || enrichmentData?.company?.size) && 
      (lead.city || lead.state || lead.country || 
       enrichmentData?.company?.location?.city ||
       enrichmentData?.company?.location?.state ||
       enrichmentData?.company?.location?.country)) {
    score += 20;
  }
  
  return Math.min(score, 100);
}

/**
 * Fetch company data from domain using OpenAI extraction
 */
async function fetchCompany(domain: string): Promise<{
  name: string | null;
  industry: string | null;
  size: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  logo: string | null;
}> {
  try {
    // Try to fetch the website HTML
    const url = `https://${domain}`;
    let html = "";
    
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SmartSendBot/1.0; +https://smartsend.ai/bot)"
        }
      });
      
      if (response.ok) {
        html = await response.text();
        // Limit HTML size to avoid token limits
        html = html.slice(0, 10000);
      }
    } catch (err) {
      console.warn(`Failed to fetch ${url}:`, err);
    }

    // Use OpenAI to extract company information
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Extract company information from HTML. Return only valid JSON."
        },
        {
          role: "user",
          content: html
            ? `Extract company information from this HTML for domain ${domain}:\n\n${html}`
            : `Extract company information for domain ${domain}. Return best guess based on domain name.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });

    const content = completion.choices?.[0]?.message?.content || "{}";
    const extracted = JSON.parse(content);

    // Normalize the response
    return {
      name: extracted.name || extracted.company_name || null,
      industry: extracted.industry || null,
      size: extracted.size || extracted.company_size || null,
      city: extracted.city || extracted.location?.city || null,
      state: extracted.state || extracted.location?.state || null,
      country: extracted.country || extracted.location?.country || null,
      logo: extracted.logo || extracted.logo_url || null
    };
  } catch (error) {
    console.error(`Error fetching company data for ${domain}:`, error);
    return {
      name: null,
      industry: null,
      size: null,
      city: null,
      state: null,
      country: null,
      logo: null
    };
  }
}

Deno.serve(async (req) => {
  try {
    // Support both POST (manual trigger) and GET (cron)
    const body = req.method === "POST" ? await req.json() : {};
    const workspaceId = body.workspace_id || null;
    const limit = body.limit || 50;

    // Fetch leads that need enrichment
    let query = supabase
      .from("leads")
      .select("*")
      .eq("enriched", false)
      .limit(limit);

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    const { data: leads, error: leadsError } = await query;

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch leads", details: leadsError.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No leads to enrich" }),
        { headers: { "content-type": "application/json" } }
      );
    }

    let processed = 0;
    let errors = 0;

    for (const lead of leads) {
      try {
        // Extract domain from email or website
        const domain = extractDomain(lead.email, lead.website);

        if (!domain) {
          console.warn(`Skipping lead ${lead.id}: no domain found`);
          continue;
        }

        // Check company cache (prefer workspace-specific, but allow cross-workspace cache)
        let companyQuery = supabase
          .from("company_enrichment")
          .select("*")
          .eq("domain", domain);

        if (lead.workspace_id) {
          // First try workspace-specific cache
          companyQuery = companyQuery.eq("workspace_id", lead.workspace_id);
        }

        const { data: company, error: companyError } = await companyQuery
          .order("enriched_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let companyData = company;

        // If not cached, fetch and cache
        if (!companyData && !companyError) {
          const enriched = await fetchCompany(domain);

          // Insert into cache
          const { data: newCompany, error: insertError } = await supabase
            .from("company_enrichment")
            .insert({
              workspace_id: lead.workspace_id,
              domain,
              company_name: enriched.name,
              size: enriched.size,
              industry: enriched.industry,
              city: enriched.city,
              state: enriched.state,
              country: enriched.country,
              logo_url: enriched.logo,
              enriched_at: new Date().toISOString()
            })
            .select()
            .single();

          if (insertError) {
            console.error(`Failed to cache company for ${domain}:`, insertError);
            // Continue anyway with the fetched data
            companyData = {
              domain,
              company_name: enriched.name,
              size: enriched.size,
              industry: enriched.industry,
              city: enriched.city,
              state: enriched.state,
              country: enriched.country,
              logo_url: enriched.logo
            };
          } else {
            companyData = newCompany;
          }
        }

        // Prepare enrichment data
        const enrichmentData = {
          company: {
            name: companyData?.company_name || null,
            size: companyData?.size || null,
            industry: companyData?.industry || null,
            location: {
              city: companyData?.city || null,
              state: companyData?.state || null,
              country: companyData?.country || null
            },
            domain,
            logo: companyData?.logo_url || null
          }
        };

        // Calculate enrichment score
        const enrichmentScore = calculateEnrichmentScore(lead, enrichmentData);

        // Update lead
        const { error: updateError } = await supabase
          .from("leads")
          .update({
            enriched: true,
            enriched_at: new Date().toISOString(),
            enrichment_source: "engine_v1",
            enrichment_data: enrichmentData,
            enrichment_score: enrichmentScore,
            // Also update normalized columns if they exist
            company: companyData?.company_name || lead.company,
            industry: companyData?.industry || lead.industry,
            company_size: companyData?.size || lead.company_size,
            city: companyData?.city || lead.city,
            state: companyData?.state || lead.state,
            country: companyData?.country || lead.country,
            domain: domain || lead.domain
          })
          .eq("id", lead.id);

        if (updateError) {
          console.error(`Failed to update lead ${lead.id}:`, updateError);
          errors++;
          continue;
        }

        processed++;
      } catch (error) {
        console.error(`Error processing lead ${lead.id}:`, error);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        errors,
        total: leads.length
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    console.error("run-enrichment-v1 error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

