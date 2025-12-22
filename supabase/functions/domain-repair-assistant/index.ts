// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

if (!openaiApiKey) {
  throw new Error("Missing OPENAI_API_KEY environment variable");
}

const supabaseClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: openaiApiKey });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { domain_id } = await req.json();

    if (!domain_id) {
      return new Response(
        JSON.stringify({ error: "domain_id is required" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Fetch domain data
    const { data: domain, error: domainError } = await supabaseClient
      .from("sender_domains")
      .select("*")
      .eq("id", domain_id)
      .single();

    if (domainError || !domain) {
      return new Response(
        JSON.stringify({ error: "Domain not found" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    // Get inbox stats for this domain
    const { data: inboxes } = await supabaseClient
      .from("sender_inboxes")
      .select("id, email, connected")
      .eq("domain_id", domain_id);

    // Get recent email events for bounce/spam stats
    const { data: events } = await supabaseClient
      .from("email_events")
      .select("event_type, created_at")
      .in(
        "sender_inbox_id",
        (inboxes || []).map((i) => i.id)
      )
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // Calculate stats
    const sentCount = (events || []).filter((e) => e.event_type === "sent").length;
    const bounceCount = (events || []).filter((e) => e.event_type === "bounce").length;
    const spamCount = (events || []).filter((e) => e.event_type === "spam").length;
    const bounceRate = sentCount > 0 ? (bounceCount / sentCount) * 100 : 0;
    const spamRate = sentCount > 0 ? (spamCount / sentCount) * 100 : 0;

    // Get domain age
    const domainAgeDays = Math.floor(
      (Date.now() - new Date(domain.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get TLD
    const tld = domain.domain.split(".").pop()?.toLowerCase() || "";

    // Get warmup phase
    const { data: warmupPhase } = await supabaseClient.rpc(
      "get_domain_warmup_phase",
      { p_domain_id: domain_id }
    );

    // Get warmup limits
    const { data: warmupLimits } = await supabaseClient.rpc(
      "get_domain_warmup_limits",
      { p_domain_id: domain_id }
    );

    // Prepare domain data for AI
    const domainData = {
      domain: domain.domain,
      spf_valid: domain.spf_valid,
      dkim_valid: domain.dkim_valid,
      dmarc_valid: domain.dmarc_valid,
      domain_health_score: domain.domain_health_score || 50,
      warmup_stage: domain.warmup_stage || 0,
      domain_age_days: domainAgeDays,
      tld: tld,
      bounce_rate: bounceRate.toFixed(2),
      spam_rate: spamRate.toFixed(2),
      inbox_count: (inboxes || []).length,
      connected_inbox_count: (inboxes || []).filter((i) => i.connected).length,
      warmup_phase: warmupPhase || "unknown",
      warmup_limits: warmupLimits || {},
      domain_flags: domain.domain_flags || [],
    };

    // AI prompt
    const prompt = `You are a domain deliverability expert.

Analyze this domain:

${JSON.stringify(domainData, null, 2)}

Return a JSON object with:
{
  "status": "healthy" | "warning" | "critical",
  "issues": ["array of issue descriptions"],
  "dns_fixes": ["array of DNS repair steps"],
  "warmup_plan": {
    "phase": 1 | 2 | 3,
    "daily_send_limit": number,
    "recommended_inboxes": number,
    "steps": ["array of warmup steps"]
  },
  "cooldown_recommendation": "string describing cooldown needs",
  "recommendations": ["array of general recommendations"]
}

Be specific and actionable. Focus on:
- DNS configuration issues (SPF, DKIM, DMARC)
- Domain reputation problems
- Warmup strategy
- Send volume limits
- TLD concerns
- Domain age considerations`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a domain deliverability expert. Return only valid JSON, no markdown formatting.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const aiResponse = completion.choices[0]?.message?.content;
    if (!aiResponse) {
      throw new Error("No response from AI");
    }

    let repairPlan;
    try {
      repairPlan = JSON.parse(aiResponse);
    } catch (e) {
      // Fallback if JSON parsing fails
      repairPlan = {
        status: domain.domain_health_score >= 70 ? "healthy" : domain.domain_health_score >= 50 ? "warning" : "critical",
        issues: [],
        dns_fixes: [],
        warmup_plan: warmupLimits || {},
        cooldown_recommendation: "",
        recommendations: [],
      };
    }

    // Store repair plan in domain_alerts or a separate table
    // For now, we'll return it directly

    return new Response(
      JSON.stringify({
        domain_id,
        domain: domain.domain,
        repair_plan: repairPlan,
        domain_data: domainData,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in domain repair assistant:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
});



