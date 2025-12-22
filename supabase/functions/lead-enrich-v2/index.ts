import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.58.1";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

async function scrape(url: string): Promise<string> {
  try {
    const res = await fetch(url, { 
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SmartSendBot/1.0; +https://smartsend.ai/bot)"
      }
    });
    if (!res.ok) {
      return "";
    }
    return await res.text();
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { 
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  try {
    const { lead } = await req.json();

    if (!lead || !lead.id) {
      return new Response(JSON.stringify({ error: "Missing lead" }), { 
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    // Extract domain from email or use company field
    const domain = lead.email?.split("@")?.[1] || lead.company || "";
    if (!domain) {
      return new Response(JSON.stringify({ error: "No domain found" }), { 
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const websiteGuess = domain.startsWith("http") ? domain : `https://${domain}`;

    // Scrape homepage
    const raw_html = await scrape(websiteGuess);

    if (!raw_html) {
      console.warn(`Failed to scrape ${websiteGuess}`);
    }

    // Extract text content from HTML (basic extraction)
    const htmlSnippet = raw_html.slice(0, 6000);

    const prompt = `You are SmartSend Enrichment v2. 
Extract structured company info from the email domain and website HTML.

Domain: ${domain}

HTML:
"""
${htmlSnippet}
"""

Return JSON only:
{
  "website": "<url or null>",
  "description": "<company description from meta tags or about section>",
  "industry": "<industry classification>",
  "employee_count": <integer guess based on website content, team page, or industry norms>,
  "company_size": "<micro|small|medium|enterprise>",
  "tech_stack": ["React","Node.js","Shopify"]
}

Rules:
- website: Use the actual URL if found, otherwise construct from domain
- description: Extract from meta description, title, or about section
- industry: Classify based on content (e.g., "SaaS", "E-commerce", "Healthcare", "Finance")
- employee_count: Estimate based on team page, job listings, or industry averages
- company_size: micro (<10), small (10-50), medium (50-250), enterprise (250+)
- tech_stack: Detect frameworks, CMS, e-commerce platforms, marketing tools (max 10 items)`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a company data extraction assistant. Return only valid JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.35,
      response_format: { type: "json_object" }
    });

    const content = completion.choices?.[0]?.message?.content || "{}";
    const enriched = JSON.parse(content);

    // Normalize and validate the enriched data
    const website = enriched.website || (domain ? `https://${domain}` : null);
    const company_description = enriched.description || null;
    const industry = enriched.industry || null;
    const employee_count = typeof enriched.employee_count === "number" ? enriched.employee_count : null;
    const company_size = ["micro", "small", "medium", "enterprise"].includes(enriched.company_size) 
      ? enriched.company_size 
      : null;
    const tech_stack = Array.isArray(enriched.tech_stack) 
      ? enriched.tech_stack.filter((t: any) => typeof t === "string").slice(0, 10)
      : [];

    // Update the lead record
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        website: website,
        company_description: company_description,
        industry: industry,
        employee_count: employee_count,
        company_size: company_size,
        tech_stack: tech_stack.length > 0 ? tech_stack : null,
        enrichment_v2: true
      })
      .eq("id", lead.id);

    if (updateError) {
      console.error("Failed to update lead:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update lead" }), { 
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    // Fetch updated lead data for downstream processing
    const { data: updatedLead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead.id)
      .single();

    if (updatedLead) {
      // Trigger v2 scoring (fire and forget)
      try {
        const edgeBaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const scoringUrl = `${edgeBaseUrl}/functions/v1/lead-score-v2`;
        
        fetch(scoringUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
          },
          body: JSON.stringify({ lead: updatedLead })
        }).catch(err => {
          console.warn("Failed to trigger v2 scoring:", err);
        });
      } catch (err) {
        console.warn("Error triggering v2 scoring:", err);
      }

      // Trigger embedding generation (fire and forget)
      try {
        const edgeBaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const embeddingUrl = `${edgeBaseUrl}/functions/v1/embedding-lead`;
        
        fetch(embeddingUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
          },
          body: JSON.stringify({ lead: updatedLead })
        }).catch(err => {
          console.warn("Failed to trigger embedding generation:", err);
        });
      } catch (err) {
        console.warn("Error triggering embedding:", err);
      }
    }

    return new Response(JSON.stringify({ ok: true, enriched }), {
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("lead-enrich-v2 error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), { 
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});

