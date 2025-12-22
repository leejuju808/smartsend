// SmartSend v3: AI Prospector Edge Function
// Collects leads from public sources and scores them with AI embeddings

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

// Example keyword set per org
const DEFAULT_KEYWORDS = ["SaaS founder", "marketing agency", "B2B lead gen"];

interface LeadCandidate {
  company?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  website?: string;
  title?: string;
  industry?: string;
  location?: string;
}

// Fetch leads from SerpAPI (or other sources)
async function fetchLeadsFromSource(source: string, keywords: string[]): Promise<LeadCandidate[]> {
  const serpApiKey = Deno.env.get("SERP_API_KEY");
  
  if (!serpApiKey) {
    console.warn("SERP_API_KEY not set, returning mock data");
    // Return mock data for testing
    return [
      {
        company: "Acme Corp",
        contact_name: "John Doe",
        email: "john@acme.com",
        title: "VP of Sales",
        industry: "Technology",
        location: "San Francisco, CA",
        website: "https://acme.com",
      },
    ];
  }

  try {
    const query = keywords.join(",");
    const response = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpApiKey}`
    );

    if (!response.ok) {
      console.error("SerpAPI request failed:", response.statusText);
      return [];
    }

    const data = await response.json();
    const leads = (data.organic_results || [])
      .slice(0, 25)
      .map((r: any) => ({
        company: r.title || null,
        contact_name: r.snippet?.match(/[A-Z][a-z]+ [A-Z][a-z]+/)?.[0] ?? null,
        email: r.snippet?.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] ?? null,
        source: "web",
      }))
      .filter((lead: LeadCandidate) => lead.company); // Only include leads with company name

    return leads;
  } catch (error) {
    console.error("Error fetching leads from SerpAPI:", error);
    return [];
  }
}

// Score a lead using OpenAI embeddings (simple relevance heuristic)
async function scoreLead(lead: LeadCandidate): Promise<number> {
  try {
    const text = `${lead.company} ${lead.contact_name ?? ""}`.trim();
    
    if (!text) {
      return 0;
    }

    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    // Simple relevance heuristic: sum of absolute values of first 10 dimensions
    const score = emb.data[0].embedding
      .slice(0, 10)
      .reduce((a, b) => a + Math.abs(b), 0);

    // Normalize to 0-100 scale (rough approximation)
    return Math.min(100, Math.max(0, score * 10));
  } catch (error) {
    console.error("Error scoring lead:", error);
    return 50; // Default score on error
  }
}

Deno.serve(async (req) => {
  try {
    // Support both GET (for scheduled runs) and POST (for manual triggers)
    let orgId: string | null = null;
    let keywords: string[] = DEFAULT_KEYWORDS;

    if (req.method === "POST") {
      const body = await req.json();
      orgId = body.org_id || null;
      keywords = body.keywords || DEFAULT_KEYWORDS;
    } else if (req.method === "GET") {
      // For scheduled runs, get org_id from query params or fetch all orgs
      const url = new URL(req.url);
      orgId = url.searchParams.get("org_id");
      const keywordsParam = url.searchParams.get("keywords");
      if (keywordsParam) {
        keywords = keywordsParam.split(",");
      }
    } else {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // STEP 1 – Fetch candidate companies from SerpAPI
    console.log("Fetching leads with keywords:", keywords);
    const candidates = await fetchLeadsFromSource("web", keywords);

    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({ message: "No candidates found", inserted: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${candidates.length} candidate leads`);

    // STEP 2 – Score each lead with embeddings
    let inserted = 0;
    let skipped = 0;

    for (const lead of candidates) {
      try {
        // Skip if missing critical data
        if (!lead.company) {
          skipped++;
          continue;
        }

        // If org_id is provided, check for duplicates within that org
        // Otherwise, use a default "system" org_id
        const targetOrgId = orgId || "00000000-0000-0000-0000-000000000000"; // Fallback system org

        if (lead.email) {
          const { data: existing } = await supabase
            .from("ai_leads_queue")
            .select("id")
            .eq("org_id", targetOrgId)
            .eq("email", lead.email)
            .maybeSingle();

          if (existing) {
            skipped++;
            continue;
          }
        }

        // Score the lead using embeddings
        const score = await scoreLead(lead);

        // Insert into queue
        const { error: insertError } = await supabase.from("ai_leads_queue").insert({
          org_id: targetOrgId,
          source: "web",
          company: lead.company,
          contact_name: lead.contact_name || null,
          email: lead.email || null,
          score,
          status: "new",
        });

        if (!insertError) {
          inserted++;
        } else {
          console.error("Insert error:", insertError);
          skipped++;
        }

        // Rate limiting for API calls
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error processing lead:`, error);
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({
        message: "Prospector run complete",
        inserted,
        skipped,
        total: candidates.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

