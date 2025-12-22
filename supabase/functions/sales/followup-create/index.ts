// Block 59000 — SmartSend Roofing "AI Sales Coach + Objection Handling System" v1
// Edge Function: Create Sales Follow-Up Sequences
// Creates scheduled follow-up messages for proposals

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import OpenAI from "npm:openai";

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
      follow_up_type = "initial", // 'initial', 'nudge', 'pre_expiration', 'last_chance', 'rescue'
      custom_scheduled_at,
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

    // Determine follow-up sequence based on type
    let followUps: Array<{
      day: number;
      type: string;
      scheduled_at: string;
      message_type: "email" | "sms" | "voicemail";
    }> = [];

    const now = new Date();
    const sentAt = proposal.sent_at ? new Date(proposal.sent_at) : now;

    if (follow_up_type === "initial" || follow_up_type === "auto") {
      // Standard sequence: Day 1, 3, 7, 14, pre-expiration, last chance
      followUps = [
        { day: 1, type: "nudge", scheduled_at: new Date(sentAt.getTime() + 24 * 60 * 60 * 1000).toISOString(), message_type: "email" },
        { day: 3, type: "nudge", scheduled_at: new Date(sentAt.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(), message_type: "sms" },
        { day: 7, type: "nudge", scheduled_at: new Date(sentAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), message_type: "email" },
        { day: 14, type: "nudge", scheduled_at: new Date(sentAt.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(), message_type: "sms" },
      ];
    } else if (follow_up_type === "rescue") {
      // Immediate rescue follow-up
      followUps = [
        { day: 0, type: "rescue", scheduled_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(), message_type: "sms" },
      ];
    } else if (follow_up_type === "pre_expiration") {
      // Pre-expiration warning (assume 30-day expiration)
      const expirationDate = new Date(sentAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      followUps = [
        { day: 25, type: "pre_expiration", scheduled_at: new Date(expirationDate.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), message_type: "email" },
      ];
    } else if (follow_up_type === "last_chance") {
      // Last chance (assume 30-day expiration)
      const expirationDate = new Date(sentAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      followUps = [
        { day: 29, type: "last_chance", scheduled_at: new Date(expirationDate.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(), message_type: "sms" },
      ];
    } else if (custom_scheduled_at) {
      // Custom scheduled follow-up
      followUps = [
        { day: 0, type: follow_up_type, scheduled_at: custom_scheduled_at, message_type: "email" },
      ];
    }

    // Generate AI messages for each follow-up
    const createdFollowUps = [];

    for (const followUp of followUps) {
      // Generate AI message
      const prompt = `You are SmartSend AI — an expert roofing sales follow-up generator.

Generate a ${followUp.message_type === "sms" ? "short text message" : "professional email"} for a roofing contractor to send to a homeowner.

CONTEXT:
- Homeowner: ${lead.first_name || ""} ${lead.last_name || ""}
- Proposal Amount: $${proposal.amount || "unknown"}
- Proposal Status: ${proposal.status || "sent"}
- Follow-Up Type: ${followUp.type}
- Day: ${followUp.day} days after proposal sent
- Message Type: ${followUp.message_type}

RULES:
- ${followUp.message_type === "sms" ? "Keep it under 160 characters if possible. Be concise, urgent, and personal." : "Keep it to 2-3 short paragraphs. Professional but friendly."}
- Create urgency without being pushy
- Focus on value and next steps
- Use the homeowner's first name
- Be specific about what you're offering
- Remove risk and build confidence

FOLLOW-UP TYPE GUIDANCE:
- "nudge": Gentle reminder, offer to answer questions, create mild urgency
- "rescue": Urgent but helpful, offer immediate value, create scarcity
- "pre_expiration": Warn about expiration, create urgency, offer to extend if needed
- "last_chance": Final opportunity, create strong urgency, offer best terms

Return ONLY the message text, no subject line, no JSON wrapper, just the message.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: "You are SmartSend AI. Generate sales follow-up messages. Return only the message text, no formatting, no JSON.",
          },
          { role: "user", content: prompt },
        ],
      });

      const message = completion.choices[0]?.message?.content?.trim() || "";

      // Create follow-up record
      const { data: followUpRecord, error: insertError } = await supabase
        .from("sales_followups")
        .insert({
          proposal_id,
          lead_id: lead_id || lead.id,
          homeowner_id: homeowner_id || null,
          workspace_id,
          type: followUp.message_type,
          message,
          scheduled_at: followUp.scheduled_at,
          follow_up_sequence_day: followUp.day,
          follow_up_type: followUp.type,
          sent: false,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating follow-up:", insertError);
        continue;
      }

      createdFollowUps.push(followUpRecord);
    }

    return new Response(
      JSON.stringify({
        success: true,
        followups: createdFollowUps,
        count: createdFollowUps.length,
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
































