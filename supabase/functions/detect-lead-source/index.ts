// supabase/functions/detect-lead-source/index.ts
// Block 21966 — SmartSend Roofing Lead Source Intelligence v1
// AI-powered automatic lead source detection from homeowner messages and metadata

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { OpenAI } from "https://esm.sh/openai@4.0.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")!,
});

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { lead_id, message_body, metadata } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "lead_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get lead to check workspace_id
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, workspace_id, lead_source")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // If source already manually set and high confidence, skip detection
    if (lead.lead_source && metadata?.manual_override === true) {
      return new Response(
        JSON.stringify({ 
          source: lead.lead_source, 
          confidence: 100,
          method: "manual_override"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build detection prompt
    const prompt = `Classify the most likely lead source for a roofing company based on message text and optional metadata.

Possible sources:
- google_search (found via Google search, organic)
- google_ads (clicked Google ad)
- facebook_ads (saw Facebook ad)
- homeadvisor (came from HomeAdvisor)
- angi (came from Angi/Angie's List)
- thumbtack (came from Thumbtack)
- yard_sign (saw yard sign)
- door_hanger (received door hanger)
- referral (recommended by someone)
- real_estate_agent (referred by real estate agent)
- insurance_adjuster (referred by insurance adjuster)
- walk_in (walked into office)
- event (met at event/expo)
- cold_email (from cold email campaign)
- resurrection (re-engaged from old lead)
- unknown (cannot determine)

Message text: "${message_body || ""}"

Metadata: ${JSON.stringify(metadata || {})}

Look for phrases like:
- "Found you on Google" → google_search
- "Saw your ad" → google_ads or facebook_ads (check metadata)
- "Saw your sign" → yard_sign
- "You were recommended by" → referral
- "This is from HomeAdvisor" → homeadvisor
- UTM parameters in metadata → check utm_source, utm_medium, utm_campaign
- Tracking numbers → check metadata for phone tracking info

Respond with JSON only: { "source": "...", "confidence": 0-100 }
Confidence should be:
- 90-100: Very clear indicators (explicit mention, UTM params)
- 70-89: Strong indicators (phrases, context)
- 50-69: Moderate indicators (inferred from context)
- 30-49: Weak indicators
- 0-29: Very uncertain → use "unknown"`;

    // Call OpenAI for classification
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a lead source classifier for a roofing company. Analyze messages and metadata to determine where leads came from. Respond only with valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3, // Lower temperature for more consistent classification
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    const detectedSource = result.source || "unknown";
    const confidence = Math.max(0, Math.min(100, result.confidence || 0));

    // Update lead with detected source
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        lead_source: detectedSource,
        lead_source_confidence: confidence,
      })
      .eq("id", lead_id);

    if (updateError) {
      console.error("Error updating lead source:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update lead source" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log to audit trail
    await supabase.from("lead_audit_logs").insert({
      lead_id,
      event_type: "lead_source_detected",
      actor_type: "system",
      event_data: {
        source: detectedSource,
        confidence,
        method: metadata?.manual_override ? "manual_override" : "ai_classification",
        message_preview: message_body?.substring(0, 200) || null,
        metadata: metadata || {},
      },
    }).catch((err) => {
      // Don't fail if audit log fails
      console.error("Error logging to audit trail:", err);
    });

    return new Response(
      JSON.stringify({
        source: detectedSource,
        confidence,
        method: metadata?.manual_override ? "manual_override" : "ai_classification",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("detect-lead-source error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});









































