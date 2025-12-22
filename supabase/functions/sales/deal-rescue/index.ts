// Block 59000 — SmartSend Roofing "AI Sales Coach + Objection Handling System" v1
// Edge Function: Deal Rescue AI Follow-Up Generator
// Generates rescue messages for stalled deals

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai";
import { createClient } from "jsr:@supabase/supabase-js@2";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      proposal_id,
      lead_id,
      homeowner_id,
      workspace_id,
      situation, // 'viewed_no_sign', 'responded_then_silent', 'asked_question_then_disappeared', 'slowing_communication'
      user_id,
      auto_schedule_followup = false,
    } = await req.json();

    if (!proposal_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "proposal_id and workspace_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get proposal and lead context
    const { data: proposal } = await supabase
      .from("proposals")
      .select(`
        id,
        amount,
        status,
        sent_at,
        viewed_at,
        leads:lead_id(
          id,
          first_name,
          last_name,
          email,
          phone
        )
      `)
      .eq("id", proposal_id)
      .single();

    if (!proposal) {
      return new Response(
        JSON.stringify({ error: "Proposal not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lead = proposal.leads;
    if (!lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found for proposal" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const homeownerName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "there";

    // Determine situation description
    const situationDescriptions: Record<string, string> = {
      viewed_no_sign: "Homeowner viewed the proposal but hasn't signed yet",
      responded_then_silent: "Homeowner responded once but then went silent",
      asked_question_then_disappeared: "Homeowner asked a question but then disappeared",
      slowing_communication: "Homeowner's communication is slowing down",
    };

    const situationDesc = situationDescriptions[situation] || situation || "Deal is stalled";

    // Build AI prompt for deal rescue
    const prompt = `You are SmartSend AI — an expert deal rescue specialist for roofing contractors.

Generate a powerful rescue message to bring a stalled deal back to life.

SITUATION:
${situationDesc}

CONTEXT:
- Homeowner: ${homeownerName}
- Proposal Amount: $${proposal.amount || "unknown"}
- Proposal Status: ${proposal.status || "sent"}
- Proposal Sent: ${proposal.sent_at || "unknown"}
- Proposal Viewed: ${proposal.viewed_at || "not yet"}

Generate THREE versions of the rescue message:

1. TEXT_MESSAGE: Short, urgent SMS/text (under 160 characters if possible)
2. EMAIL_MESSAGE: Professional email (2-3 short paragraphs)
3. VOICEMAIL_SCRIPT: What to say if leaving a voicemail

RULES:
- Create urgency without being pushy
- Offer immediate value or help
- Use scarcity (crew schedule, material pricing, weather, etc.)
- Be helpful and consultative
- Remove risk and build confidence
- Make it personal and specific
- Focus on what they'll miss if they wait
- Include a clear, low-pressure next step

EXAMPLES OF GOOD RESCUE MESSAGES:
- "Hey Sarah, just letting you know the install crew schedule for next week is almost full. If you want your roof done before the next rainstorm, I can still fit you in. Let me know and I'll lock your spot."
- "Hi John, I noticed you viewed the proposal. Do you have any questions? I'm here to help and can walk you through everything. Also, material prices are going up next month, so locking in now saves you money."

Return ONLY valid JSON in this exact format:
{
  "text_message": "...",
  "email_message": "...",
  "voicemail_script": "...",
  "urgency_reason": "Why this creates urgency (for contractor reference)",
  "next_step": "What the contractor should do next"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are SmartSend AI, an expert deal rescue specialist. Always return valid JSON with the exact fields specified.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", raw }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optionally auto-schedule follow-up
    let followupId = null;
    if (auto_schedule_followup) {
      const { data: followup } = await supabase
        .from("sales_followups")
        .insert({
          proposal_id,
          lead_id: lead_id || lead.id,
          homeowner_id: homeowner_id || null,
          workspace_id,
          type: "sms",
          message: parsed.text_message || "",
          scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
          follow_up_type: "rescue",
          follow_up_sequence_day: 0,
          sent: false,
        })
        .select()
        .single();

      followupId = followup?.id || null;
    }

    return new Response(
      JSON.stringify({
        success: true,
        followup_id: followupId,
        text_message: parsed.text_message || "",
        email_message: parsed.email_message || "",
        voicemail_script: parsed.voicemail_script || "",
        urgency_reason: parsed.urgency_reason || "",
        next_step: parsed.next_step || "",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































