// Block 22094 — SmartSend Roofing "AI Next-Action Engine" v1
// Edge Function: Generate Next Best Action for a Job
// Called whenever:
// - health changes
// - momentum changes
// - experience changes
// - timeline events
// - estimator replies
// - homeowner replies
// - risk changes
// - proposal status changes

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { OpenAI } from "https://esm.sh/openai@4.0.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

// Valid next action types
const VALID_ACTIONS = [
  "send_followup",
  "send_soft_reengagement",
  "send_tone_reset",
  "request_photos",
  "call_now",
  "schedule_inspection",
  "send_proposal_now",
  "resend_proposal",
  "clarify_proposal",
  "ask_insurance_status",
  "ask_timeline",
  "ask_additional_details",
  "recovery_message",
  "escalate_to_owner",
] as const;

type NextAction = typeof VALID_ACTIONS[number];

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  // Allow POST requests only
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { lead_id } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Pull full intelligence snapshot from unified view
    const { data: lead, error: viewError } = await supabase
      .from("lead_full_intelligence_view")
      .select("*")
      .eq("lead_id", lead_id)
      .single();

    if (viewError || !lead) {
      console.error("Error fetching lead intelligence:", viewError);
      
      // Fallback: try fetching directly from leads table
      const { data: fallbackLead, error: fallbackError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", lead_id)
        .single();

      if (fallbackError || !fallbackLead) {
        return new Response(
          JSON.stringify({ error: "Lead not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      // Use fallback data with minimal intelligence
      const minimalData = {
        lead_id: fallbackLead.id,
        status: fallbackLead.status,
        pipeline_stage: fallbackLead.pipeline_stage,
        job_health_score: fallbackLead.job_health_score || 50,
        momentum_score: fallbackLead.momentum_score || 50,
        homeowner_experience_score: fallbackLead.homeowner_experience_score || 50,
        job_probability: fallbackLead.job_probability || 50,
        risk_category: fallbackLead.risk_category || "medium",
        days_since_last_reply: fallbackLead.last_reply_at 
          ? Math.floor((Date.now() - new Date(fallbackLead.last_reply_at).getTime()) / (1000 * 60 * 60 * 24))
          : null,
      };

      return await generateAction(minimalData);
    }

    return await generateAction(lead);
  } catch (error: any) {
    console.error("Error in generate-next-action:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  async function generateAction(leadData: any) {
    // Build comprehensive prompt for OpenAI
    const prompt = `You are SmartSend AI, a roofing sales intelligence system.
Your job is to recommend the BEST POSSIBLE NEXT ACTION to increase the chance of winning this roofing job.

Lead Snapshot:
${JSON.stringify(leadData, null, 2)}

Available Actions:
- send_followup: Quick check-in message (momentum is good, keep engagement)
- send_soft_reengagement: Soft re-engagement message (homeowner ghosting, low engagement)
- send_tone_reset: Tone reset message (frustration detected, need to rebuild trust)
- request_photos: Request photos from homeowner (need more info to proceed)
- call_now: Direct call required (urgent, high value, or frustration detected)
- schedule_inspection: Schedule inspection (homeowner ready, momentum peak)
- send_proposal_now: Send proposal immediately (momentum peak, all info gathered)
- resend_proposal: Resend proposal (proposal sent but no response)
- clarify_proposal: Clarify proposal line items (confusion detected)
- ask_insurance_status: Ask about insurance status (need insurance info)
- ask_timeline: Ask homeowner for preferred install timeline
- ask_additional_details: Ask for additional job details
- recovery_message: Recovery/apology message (job save required, critical situation)
- escalate_to_owner: Escalate to owner/manager (complex situation, needs attention)

Consider these factors:
1. Job Health Score: ${leadData.job_health_score || 50}/100
2. Momentum Score: ${leadData.momentum_score || 50}/100 (trend: ${leadData.momentum_trend || "neutral"})
3. Experience Score: ${leadData.homeowner_experience_score || 50}/100 (trend: ${leadData.experience_trend || "stable"})
4. Job Probability: ${leadData.job_probability || 50}%
5. Risk Category: ${leadData.risk_category || "medium"}
6. Days since last reply: ${leadData.days_since_last_reply || "unknown"}
7. Has proposal: ${leadData.has_proposal ? "yes" : "no"}
8. Has inspection: ${leadData.has_inspection ? "yes" : "no"}
9. Job save active: ${leadData.has_active_save ? "yes" : "no"}
10. Current status: ${leadData.status || "unknown"}
11. Pipeline stage: ${leadData.pipeline_stage || "unknown"}

Choose EXACTLY ONE action that will have the highest impact on winning this job.
Be specific and actionable in your reason.

Respond in JSON format:
{
  "action": "one_of_the_actions_above",
  "reason": "Clear explanation of why this action is recommended (2-3 sentences)"
}`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a roofing sales AI expert. Analyze the job intelligence and recommend the single best next action to increase win probability. Always respond in valid JSON format.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent, focused recommendations
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error("No response from OpenAI");
    }

    let result: { action: NextAction; reason: string };
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", responseText);
      // Fallback to default action
      result = {
        action: "send_followup",
        reason: "Unable to parse AI recommendation. Defaulting to follow-up.",
      };
    }

    // Validate action
    if (!VALID_ACTIONS.includes(result.action as NextAction)) {
      console.warn(`Invalid action received: ${result.action}, defaulting to send_followup`);
      result.action = "send_followup";
    }

    // Update lead with next action
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        next_action: result.action,
        next_action_reason: result.reason,
        next_action_generated_at: new Date().toISOString(),
      })
      .eq("id", leadData.lead_id);

    if (updateError) {
      console.error("Error updating next action:", updateError);
      // Continue anyway - we still want to return the result
    }

    // Add to Timeline
    try {
      await supabase.from("job_timelines").insert({
        lead_id: leadData.lead_id,
        event_type: "next_action_generated",
        event_data: {
          category: "ai_intelligence",
          summary: `Next action: ${result.action}`,
          action: result.action,
          reason: result.reason,
          generated_at: new Date().toISOString(),
        },
      });
    } catch (timelineError) {
      // Don't fail if timeline log fails, but log it
      console.error("Error logging to job_timelines:", timelineError);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        lead_id: leadData.lead_id,
        action: result.action,
        reason: result.reason,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});









































