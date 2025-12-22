// supabase/functions/generate-message/index.ts
// Block 22103 — SmartSend Roofing "AI Message Builder" v1
// Edge Function: Generates PERFECT roofing-specific messages using SmartSend's intelligence
// Takes lead intelligence, next action, message type, estimator tone preference, and outputs perfect message

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { OpenAI } from "https://esm.sh/openai@4.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: openaiApiKey });

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

  try {
    const { lead_id, message_type } = await req.json();

    if (!lead_id || !message_type) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: lead_id and message_type" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Pull full lead intelligence data from view
    const { data: lead, error: leadError } = await supabase
      .from("lead_full_intelligence_view")
      .select("*")
      .eq("lead_id", lead_id)
      .single();

    if (leadError || !lead) {
      // Fallback: try to get basic lead data
      const { data: basicLead } = await supabase
        .from("leads")
        .select("*")
        .eq("id", lead_id)
        .single();

      if (!basicLead) {
        return new Response(
          JSON.stringify({ error: "Lead not found" }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      // Use basic lead data if view doesn't exist yet
      const fallbackLead = {
        lead_id: basicLead.id,
        workspace_id: basicLead.workspace_id,
        owner_id: basicLead.owner_id,
        email: basicLead.email,
        first_name: basicLead.first_name,
        last_name: basicLead.last_name,
        status: basicLead.status,
        pipeline_stage: basicLead.pipeline_stage,
        job_health_score: basicLead.job_health_score || null,
        momentum_score: basicLead.momentum_score || null,
        homeowner_experience_score: basicLead.homeowner_experience_score || null,
        job_probability: basicLead.job_probability || null,
        risk_score: basicLead.risk_score || null,
        next_action: basicLead.next_action || null,
        next_action_reason: basicLead.next_action_reason || null,
        homeowner_tone: basicLead.homeowner_tone || null,
        days_since_last_message: null,
        days_since_last_reply: null,
      };

      return await generateMessage(fallbackLead, message_type);
    }

    return await generateMessage(lead, message_type);
  } catch (error: any) {
    console.error("Error in generate-message:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
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

async function generateMessage(lead: any, messageType: string) {
  // Get estimator tone preference (from ai_reply_settings or personalization_settings)
  let estimatorTone = "friendly";
  if (lead.owner_id) {
    const { data: aiSettings } = await supabase
      .from("ai_reply_settings")
      .select("tone")
      .eq("user_id", lead.owner_id)
      .single();

    if (aiSettings?.tone) {
      estimatorTone = aiSettings.tone;
    } else {
      // Fallback to personalization_settings
      const { data: personalizationSettings } = await supabase
        .from("personalization_settings")
        .select("tone")
        .eq("user_id", lead.owner_id)
        .single();

      if (personalizationSettings?.tone) {
        estimatorTone = personalizationSettings.tone;
      }
    }
  }

  // Get workspace-specific message preset if exists
  let customTemplate = null;
  if (lead.workspace_id) {
    const { data: preset } = await supabase
      .from("message_presets")
      .select("template")
      .eq("workspace_id", lead.workspace_id)
      .eq("message_type", messageType)
      .single();

    if (preset?.template) {
      customTemplate = preset.template;
    }
  }

  // Build context summary for AI
  const contextSummary = buildContextSummary(lead);

  // Build prompt
  const prompt = buildPrompt(lead, messageType, estimatorTone, contextSummary, customTemplate);

  // Generate message using OpenAI
  if (!openai) {
    return new Response(
      JSON.stringify({ error: "OpenAI API key not configured" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are SmartSend AI, a roofing-specific message generator. You write PERFECT, natural, human messages for roofing estimators. You understand roofing terminology, homeowner psychology, and sales best practices.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");

    return new Response(
      JSON.stringify({
        subject: result.subject || null,
        message: result.message || "",
        recommended_delay_minutes: result.recommended_delay_minutes || 0,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("OpenAI API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate message", details: error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

function buildContextSummary(lead: any): string {
  const parts: string[] = [];

  // Basic info
  if (lead.first_name) parts.push(`Homeowner: ${lead.first_name} ${lead.last_name || ""}`.trim());
  if (lead.email) parts.push(`Email: ${lead.email}`);
  if (lead.pipeline_stage) parts.push(`Pipeline Stage: ${lead.pipeline_stage}`);

  // Scores
  if (lead.job_health_score !== null) parts.push(`Job Health: ${lead.job_health_score}/100`);
  if (lead.momentum_score !== null) parts.push(`Momentum: ${lead.momentum_score}/100`);
  if (lead.homeowner_experience_score !== null) parts.push(`Experience Score: ${lead.homeowner_experience_score}/100`);
  if (lead.job_probability !== null) parts.push(`Job Probability: ${lead.job_probability}%`);
  if (lead.risk_score !== null) parts.push(`Risk Score: ${lead.risk_score}/100`);

  // Next action
  if (lead.next_action) parts.push(`Next Action: ${lead.next_action}`);
  if (lead.next_action_reason) parts.push(`Reason: ${lead.next_action_reason}`);

  // Tone
  if (lead.homeowner_tone) parts.push(`Homeowner Tone: ${lead.homeowner_tone}`);

  // Timing
  if (lead.days_since_last_message !== null) {
    parts.push(`Days since last message: ${Math.round(lead.days_since_last_message)}`);
  }
  if (lead.days_since_last_reply !== null) {
    parts.push(`Days since last reply: ${Math.round(lead.days_since_last_reply)}`);
  }

  return parts.join("\n");
}

function buildPrompt(
  lead: any,
  messageType: string,
  estimatorTone: string,
  contextSummary: string,
  customTemplate: string | null
): string {
  const messageTypeDescriptions: Record<string, string> = {
    followup: "Quick follow-up message to check in and see if they have questions",
    soft_reengagement: "Soft re-engagement message for leads who haven't responded in a while (no pressure)",
    proposal_send: "Message to send along with a proposal, introducing it and next steps",
    photo_request: "Request for photos of the roof or damage",
    tone_reset: "Message to reset tone and rebuild rapport after frustration or miscommunication",
    job_save: "Job save message to recover a job that's at risk",
    insurance_question: "Ask about insurance status or claim progress",
    timeline_question: "Ask about timeline or when they want to move forward",
  };

  const typeDescription = messageTypeDescriptions[messageType] || messageType;

  let prompt = `You are SmartSend AI. You generate PERFECT roofing-specific messages.

Analyze the lead context and produce the ideal message for message_type = "${messageType}" (${typeDescription}).

Lead Context:
${contextSummary}

Estimator Tone Preference: ${estimatorTone}

Rules:
- Match tone to homeowner sentiment (if experience score is low, be soft & reassuring)
- If momentum is high, push forward positively
- If next_action is set, focus message on that action
- If risk is high, prioritize repair & clarity
- Keep message short, natural, human (2-4 sentences max for SMS, slightly longer for email)
- Use roofing terminology naturally
- Sound like a local roofer who cares
- Avoid sounding robotic or templated
- If homeowner tone is frustrated, be empathetic and solution-focused
- If homeowner tone is positive, match their energy
- Use the estimator's preferred tone style: ${estimatorTone}
`;

  if (customTemplate) {
    prompt += `\nCustom Template (use as inspiration, but make it natural):\n${customTemplate}\n`;
  }

  prompt += `
Format your response as JSON:
{
  "subject": "optional subject line (for email)",
  "message": "the full SMS/email text",
  "recommended_delay_minutes": 0
}

Generate the message now:`;

  return prompt;
}

