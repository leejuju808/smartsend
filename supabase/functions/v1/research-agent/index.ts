// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_BASE_URL = Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1/chat/completions";

interface ResearchPayload {
  lead_id: string;
  workspace_id?: string;
  brand_id?: string;
  force?: boolean;
}

interface LeadData {
  id: string;
  workspace_id: string | null;
  brand_id: string | null;
  website: string | null;
  domain: string | null;
  linkedin: string | null;
  company: string | null;
}

interface ResearchResult {
  company_summary: string;
  pain_points: string;
  tech_stack: string[];
  competitors: string[];
  personalization_snippets: string[];
  industry: string | null;
  services: string[];
  geographic_info: string | null;
  social_proof: Record<string, any>;
  ai_hooks: {
    email?: string[];
    sms?: string[];
    linkedin?: string[];
  };
  confidence: number;
}

Deno.serve(async (req) => {
  try {
    const payload: ResearchPayload = await req.json();

    if (!payload.lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check for cached research
    if (!payload.force) {
      const { data: cached } = await supabase
        .from("research_cache")
        .select("*")
        .eq("lead_id", payload.lead_id)
        .single();

      if (cached && cached.updated_at) {
        const updatedAt = new Date(cached.updated_at);
        const hoursSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);
        // Use cached data if less than 7 days old
        if (hoursSinceUpdate < 24 * 7) {
          return new Response(
            JSON.stringify({ ok: true, cached: true, data: cached }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Fetch lead data
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, workspace_id, brand_id, website, domain, linkedin, company")
      .eq("id", payload.lead_id)
      .single<LeadData>();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const workspaceId = payload.workspace_id || lead.workspace_id;
    const brandId = payload.brand_id || lead.brand_id;

    // Determine URL to scrape
    let urlToScrape: string | null = null;
    if (lead.website) {
      urlToScrape = lead.website.startsWith("http") ? lead.website : `https://${lead.website}`;
    } else if (lead.domain) {
      urlToScrape = `https://${lead.domain}`;
    }

    if (!urlToScrape) {
      return new Response(
        JSON.stringify({ error: "No website or domain available for research" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step A: Fetch Website HTML
    const websiteContent = await scrapeWebsite(urlToScrape);

    // Step B-D: Analyze with LLM
    const researchResult = await analyzeWithLLM(websiteContent, lead.company || "");

    // Step E: Detect Tech Stack (v1)
    const techStack = detectTechStack(websiteContent);

    // Step F: Extract Competitors
    const competitors = extractCompetitors(websiteContent, researchResult.company_summary);

    // Step G: Generate Personalization Snippets
    const personalizationSnippets = await generatePersonalizationSnippets(
      researchResult.company_summary,
      researchResult.pain_points,
      lead.company || ""
    );

    // Generate AI hooks for different channels
    const aiHooks = {
      email: await generateHooks("email", researchResult),
      sms: await generateHooks("sms", researchResult),
      linkedin: await generateHooks("linkedin", researchResult),
    };

    // Calculate confidence score
    const confidence = calculateConfidence(researchResult, techStack, competitors);

    // Save to research_cache
    const { data: savedResearch, error: saveError } = await supabase
      .from("research_cache")
      .upsert({
        lead_id: payload.lead_id,
        workspace_id: workspaceId,
        brand_id: brandId,
        url: urlToScrape,
        company_summary: researchResult.company_summary,
        pain_points: researchResult.pain_points,
        tech_stack: techStack,
        competitors: competitors,
        personalization_snippets: personalizationSnippets,
        industry: researchResult.industry,
        services: researchResult.services,
        geographic_info: researchResult.geographic_info,
        social_proof: researchResult.social_proof,
        ai_hooks: aiHooks,
        confidence: confidence,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "lead_id"
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving research:", saveError);
      return new Response(
        JSON.stringify({ error: "Failed to save research", details: saveError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update ICP score based on research
    try {
      await supabase.rpc("apply_research_to_icp_score", {
        p_lead_id: payload.lead_id,
      });
    } catch (icpError) {
      console.error("Error updating ICP score:", icpError);
      // Don't fail the request if ICP update fails
    }

    // Trigger Router v2 with research data for brand routing
    if (workspaceId) {
      try {
        await supabase.rpc("route_lead_with_research", {
          p_lead_id: payload.lead_id,
          p_workspace_id: workspaceId,
        });
      } catch (routingError) {
        console.error("Error routing lead with research:", routingError);
        // Don't fail the request if routing fails
      }
    }

    // Log activity
    try {
      await supabase.rpc("log_research_activity", {
        p_workspace_id: workspaceId,
        p_lead_id: payload.lead_id,
        p_event_type: "research_completed",
        p_message: `Research Agent completed analysis for ${lead.company || "lead"}`,
        p_metadata: {
          confidence,
          tech_stack_count: techStack.length,
          competitors_count: competitors.length,
          snippets_count: personalizationSnippets.length,
        },
      });
    } catch (logError) {
      console.error("Error logging activity:", logError);
      // Don't fail the request if logging fails
    }

    return new Response(
      JSON.stringify({ ok: true, data: savedResearch }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Research agent error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// Step A: Fetch Website HTML (light scraping)
async function scrapeWebsite(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SmartSend Research Agent/1.0)",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    
    // Extract text content (light parsing)
    const textContent = extractTextFromHTML(html);
    
    // Extract meta tags
    const metaTags = extractMetaTags(html);
    
    return JSON.stringify({
      title: extractTitle(html),
      meta: metaTags,
      text: textContent.substring(0, 5000), // Limit to 5000 chars
    });
  } catch (error) {
    console.error("Website scraping error:", error);
    return JSON.stringify({ error: error.message, text: "" });
  }
}

function extractTextFromHTML(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  
  // Extract text from common content tags
  const contentTags = ["h1", "h2", "h3", "h4", "p", "li", "span", "div"];
  const extracted: string[] = [];
  
  for (const tag of contentTags) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
    let match;
    while ((match = regex.exec(text)) !== null) {
      const content = match[1].replace(/<[^>]+>/g, "").trim();
      if (content.length > 10) {
        extracted.push(content);
      }
    }
  }
  
  return extracted.join(" ").substring(0, 5000);
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
}

function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  
  // Extract meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  if (descMatch) meta.description = descMatch[1];
  
  // Extract meta keywords
  const keywordsMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i);
  if (keywordsMatch) meta.keywords = keywordsMatch[1];
  
  return meta;
}

// Step B-D: Analyze with LLM
async function analyzeWithLLM(websiteContent: string, companyName: string): Promise<ResearchResult> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const systemPrompt = `You are an expert business intelligence analyst. Analyze website content and extract:
1. Company summary (2-3 sentences)
2. Pain points this business likely faces
3. Industry classification
4. Services/products offered
5. Geographic location if mentioned
6. Social proof signals (testimonials, awards, certifications)

Return JSON only.`;

  const userPrompt = `Analyze this website content for ${companyName || "the company"}:

${websiteContent.substring(0, 4000)}

Extract:
- company_summary: 2-3 sentence summary
- pain_points: Common problems this type of business faces
- industry: Industry classification
- services: Array of services/products mentioned
- geographic_info: Location if mentioned
- social_proof: Object with any testimonials, awards, certifications mentioned

Return valid JSON only.`;

  try {
    const response = await fetch(OPENAI_BASE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No content from LLM");
    }

    const parsed = JSON.parse(content);
    
    return {
      company_summary: parsed.company_summary || "",
      pain_points: parsed.pain_points || "",
      tech_stack: [],
      competitors: [],
      personalization_snippets: [],
      industry: parsed.industry || null,
      services: Array.isArray(parsed.services) ? parsed.services : [],
      geographic_info: parsed.geographic_info || null,
      social_proof: parsed.social_proof || {},
      ai_hooks: {},
      confidence: 0.7,
    };
  } catch (error) {
    console.error("LLM analysis error:", error);
    // Return fallback data
    return {
      company_summary: `Company information extracted from website.`,
      pain_points: "",
      tech_stack: [],
      competitors: [],
      personalization_snippets: [],
      industry: null,
      services: [],
      geographic_info: null,
      social_proof: {},
      ai_hooks: {},
      confidence: 0.3,
    };
  }
}

// Step E: Detect Tech Stack (v1)
function detectTechStack(websiteContent: string): string[] {
  const techStack: string[] = [];
  const content = websiteContent.toLowerCase();
  
  // Common tech stack detection
  const techPatterns: Record<string, string> = {
    wordpress: "WordPress",
    shopify: "Shopify",
    wix: "Wix",
    squarespace: "Squarespace",
    "react": "React",
    "vue": "Vue.js",
    "angular": "Angular",
    "salesforce": "Salesforce",
    "hubspot": "HubSpot",
    "mailchimp": "Mailchimp",
    "stripe": "Stripe",
    "paypal": "PayPal",
    "google analytics": "Google Analytics",
    "google tag manager": "Google Tag Manager",
  };
  
  for (const [pattern, name] of Object.entries(techPatterns)) {
    if (content.includes(pattern)) {
      techStack.push(name);
    }
  }
  
  // Detect HVAC SaaS patterns
  if (content.match(/hvac|heating|cooling|air conditioning/i)) {
    techStack.push("HVAC SaaS");
  }
  
  // Detect construction management tools
  if (content.match(/construction|project management|estimating/i)) {
    techStack.push("Construction Management");
  }
  
  // Detect booking forms
  if (content.match(/booking|appointment|schedule|calendar/i)) {
    techStack.push("Booking System");
  }
  
  // Detect CRM tools
  if (content.match(/crm|customer relationship|contact management/i)) {
    techStack.push("CRM");
  }
  
  return [...new Set(techStack)]; // Remove duplicates
}

// Step F: Extract Competitors
function extractCompetitors(websiteContent: string, companySummary: string): string[] {
  const competitors: string[] = [];
  const content = (websiteContent + " " + companySummary).toLowerCase();
  
  // Look for competitor mentions
  const competitorPatterns = [
    /serving\s+([^,]+?)\s+community/i,
    /serving\s+([^,]+?)\s+since/i,
    /proudly serving\s+([^,]+)/i,
  ];
  
  for (const pattern of competitorPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const location = match[1].trim();
      if (location.length > 3 && location.length < 50) {
        competitors.push(location);
      }
    }
  }
  
  // Use LLM to extract competitor names if available
  // For v1, we'll keep it simple and return location-based competitors
  
  return competitors;
}

// Step G: Generate Personalization Snippets
async function generatePersonalizationSnippets(
  companySummary: string,
  painPoints: string,
  companyName: string
): Promise<string[]> {
  if (!OPENAI_API_KEY) {
    return [
      `Saw you focus on ${companyName || "your business"} — strong market right now.`,
    ];
  }

  try {
    const response = await fetch(OPENAI_BASE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Generate 3-5 short, natural personalization snippets (10-20 words each) for outreach emails. Make them specific and conversational.",
          },
          {
            role: "user",
            content: `Company: ${companyName}\nSummary: ${companySummary}\nPain Points: ${painPoints}\n\nGenerate personalization snippets:`,
          },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      const parsed = JSON.parse(content);
      const snippets = parsed.snippets || parsed.personalization_snippets || [];
      return Array.isArray(snippets) ? snippets : [snippets];
    }
  } catch (error) {
    console.error("Error generating personalization snippets:", error);
  }

  // Fallback snippets
  return [
    `Saw you focus on ${companyName || "your business"} — strong market right now.`,
    `Loved the content on your site — very clear messaging.`,
  ];
}

// Generate AI hooks for different channels
async function generateHooks(
  channel: "email" | "sms" | "linkedin",
  research: ResearchResult
): Promise<string[]> {
  const hooks: string[] = [];
  
  if (channel === "email") {
    if (research.pain_points) {
      hooks.push(`Saw on your site you specialize in ${research.pain_points} — teams like yours often lose 5–7 hrs/week to manual processes.`);
    }
    if (research.geographic_info) {
      hooks.push(`Noticed you serve the ${research.geographic_info} market — quick idea for boosting leads.`);
    }
  } else if (channel === "sms") {
    hooks.push(`Quick one — your setup looks solid. Are you doing scheduling manually?`);
  } else if (channel === "linkedin") {
    hooks.push(`Liked the content on your site — clean work.`);
    if (research.company_summary) {
      hooks.push(`Congrats on the new project photos on your gallery page.`);
    }
  }
  
  return hooks;
}

// Calculate confidence score
function calculateConfidence(
  research: ResearchResult,
  techStack: string[],
  competitors: string[]
): number {
  let confidence = 0.3; // Base confidence
  
  if (research.company_summary && research.company_summary.length > 50) {
    confidence += 0.2;
  }
  
  if (research.pain_points && research.pain_points.length > 20) {
    confidence += 0.15;
  }
  
  if (techStack.length > 0) {
    confidence += 0.1;
  }
  
  if (competitors.length > 0) {
    confidence += 0.1;
  }
  
  if (research.industry) {
    confidence += 0.1;
  }
  
  if (research.services.length > 0) {
    confidence += 0.05;
  }
  
  return Math.min(1.0, confidence);
}

