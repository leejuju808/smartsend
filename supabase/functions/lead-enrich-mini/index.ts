// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async (req: Request) => {
  try {
    const { lead } = await req.json();

    if (!lead || !lead.id) {
      return new Response(JSON.stringify({ error: "Missing lead data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Extract domain from email
    const email = lead.email || "";
    const domain = email.split("@")[1] || "";

    // Build prompt for OpenAI
    const prompt = `You are SmartSend's enrichment AI.
Given this lead:

Name: ${lead.first_name || ""} ${lead.last_name || ""}
Email: ${lead.email || ""}
Company: ${lead.company || ""}
Domain: ${domain}

Return best guesses for:
- company (if missing, guess from email domain)
- industry (based on company name or domain)
- job title (guess from email pattern or LinkedIn patterns)
- linkedin url (construct likely LinkedIn URL pattern: linkedin.com/in/firstname-lastname or similar)
- location (guess from email domain, company name, or common patterns)

Output JSON only in this exact format:
{
  "company": "Company Name or null",
  "industry": "Industry Name or null",
  "title": "Job Title or null",
  "linkedin": "https://linkedin.com/in/... or null",
  "location": "City, State/Country or null"
}`;

    // Call OpenAI API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
            content: "You are a helpful assistant that returns only valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices?.[0]?.message?.content || "{}";

    let enriched;
    try {
      enriched = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse OpenAI response:", content);
      enriched = {};
    }

    // Update lead with enrichment data
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        guessed_company: enriched.company || null,
        guessed_industry: enriched.industry || null,
        guessed_title: enriched.title || null,
        guessed_linkedin: enriched.linkedin || null,
        guessed_location: enriched.location || null,
        enriched: true,
      })
      .eq("id", lead.id);

    if (updateError) {
      throw new Error(`Failed to update lead: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({ ok: true, enriched }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Enrichment error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});










