import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.0.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

interface EnrichLeadRequest {
  lead_id: string;
  source?: "openai" | "manual" | "clearbit" | "apollo";
}

serve(async (req) => {
  try {
    const { lead_id, source = "openai" }: EnrichLeadRequest = await req.json();

    if (!lead_id) {
      return new Response(JSON.stringify({ error: "lead_id required" }), { status: 400 });
    }

    // Get lead data
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404 });
    }

    // Check if enrichment already exists
    const { data: existing } = await supabase
      .from("lead_enrichment")
      .select("id")
      .eq("lead_id", lead_id)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ message: "Lead already enriched", enrichment_id: existing.id }),
        { status: 200 }
      );
    }

    let enrichedFields: Record<string, any> = {};

    if (source === "openai") {
      // Use OpenAI to enrich lead data
      const prompt = `Given this lead information:
Email: ${lead.email}
Name: ${lead.first_name || ""} ${lead.last_name || ""}
Company: ${lead.company || ""}
Title: ${lead.title || ""}

Enrich this lead with company and professional context. Return a JSON object with:
- company_name: Full company name
- company_domain: Company website domain
- company_size: Estimate (1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5000+)
- company_industry: Primary industry
- job_title: Refined job title
- seniority_level: (entry, mid, senior, executive, c-level)
- department: Department name
- location: {city, state, country}
- linkedin_url: LinkedIn profile URL (if inferable)
- company_description: Brief company description

Return ONLY valid JSON, no markdown formatting.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      try {
        const content = completion.choices[0].message.content;
        if (content) {
          enrichedFields = JSON.parse(content);
        }
      } catch (parseError) {
        console.error("Failed to parse OpenAI response:", parseError);
        return new Response(JSON.stringify({ error: "Failed to parse enrichment data" }), { status: 500 });
      }

    } else if (source === "clearbit") {
      // TODO: Integrate with Clearbit API
      // For now, return placeholder
      enrichedFields = {
        company_domain: lead.email.split("@")[1],
        source: "clearbit_placeholder"
      };
    } else if (source === "apollo") {
      // TODO: Integrate with Apollo API
      enrichedFields = {
        source: "apollo_placeholder"
      };
    }

    // Calculate completeness score
    const fieldsToCheck = [
      "company_name", "company_domain", "company_size", "company_industry",
      "job_title", "seniority_level", "department", "location"
    ];
    const filledFields = fieldsToCheck.filter(field => enrichedFields[field]).length;
    const completenessScore = filledFields / fieldsToCheck.length;

    // Save enrichment
    const { data: enrichment, error: enrichError } = await supabase
      .from("lead_enrichment")
      .insert({
        lead_id: lead_id,
        org_id: lead.org_id || lead.user_id,
        source: source,
        fields: enrichedFields,
        completeness_score: completenessScore,
        confidence_score: source === "openai" ? 0.85 : 0.7,
        last_verified_at: new Date().toISOString(),
        raw_response: { model: "gpt-4o-mini", tokens: completion?.usage?.total_tokens }
      })
      .select()
      .single();

    if (enrichError) {
      console.error("Error saving enrichment:", enrichError);
      return new Response(JSON.stringify({ error: enrichError.message }), { status: 500 });
    }

    // Update lead with enriched data (if available)
    const updateData: Record<string, any> = {};
    if (enrichedFields.company_name && !lead.company) {
      updateData.company = enrichedFields.company_name;
    }
    if (enrichedFields.job_title && !lead.title) {
      updateData.title = enrichedFields.job_title;
    }

    if (Object.keys(updateData).length > 0) {
      await supabase
        .from("leads")
        .update(updateData)
        .eq("id", lead_id);
    }

    // Create notification
    await supabase.from("notifications").insert({
      user_id: lead.user_id,
      org_id: lead.org_id || lead.user_id,
      type: "lead_enriched",
      severity: "success",
      title: "Lead enriched",
      message: `Enriched data for ${lead.email}`,
      action_url: `/dashboard/leads/${lead_id}`,
      sent_email: false,
      metadata: {
        lead_id: lead_id,
        completeness_score: completenessScore,
        source: source
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        enrichment: {
          id: enrichment.id,
          fields: enrichedFields,
          completeness_score: completenessScore
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in enrich_lead function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 }
    );
  }
});

