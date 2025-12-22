// Block 19850 — Inbox AI Auto-Responder v1
// Edge function for processing inbound messages and auto-generating drafts/replies

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { action, thread_id, message_id } = await req.json();

    if (action === "process_inbound") {
      // Process new inbound message and generate draft
      return await processInboundMessage(supabase, thread_id, message_id);
    } else if (action === "check_timers") {
      // Check for timer-based auto-sends
      return await checkTimerAutoSends(supabase);
    } else if (action === "check_hot_leads") {
      // Check for hot lead escalations
      return await checkHotLeadEscalations(supabase);
    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("Error in inbox-auto-responder:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ============================================================================
// PROCESS INBOUND MESSAGE
// ============================================================================

async function processInboundMessage(
  supabase: any,
  threadId: string,
  messageId: string
) {
  // Get message
  const { data: message, error: msgError } = await supabase
    .from("inbox_messages")
    .select("*")
    .eq("id", messageId)
    .single();

  if (msgError || !message) {
    throw new Error(`Message not found: ${messageId}`);
  }

  // Get user_id from thread
  const { data: userResult } = await supabase.rpc("get_thread_user_id", {
    p_thread_id: threadId,
  });

  if (!userResult) {
    throw new Error(`Could not determine user_id for thread ${threadId}`);
  }

  const userId = userResult;

  // Get user settings
  const { data: settings } = await supabase
    .from("inbox_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  // Check if AI drafting is enabled
  if (!settings?.ai_drafting_enabled) {
    return new Response(
      JSON.stringify({ success: true, skipped: "AI drafting disabled" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // Analyze message with AI
  const messageText = message.body_html?.replace(/<[^>]+>/g, " ") || message.body_text || "";
  
  // Call OpenAI for analysis
  const analysisResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are SmartSend AI Reply Brain v2. Analyze homeowner replies and return JSON with category, confidence, emotionalTone, hasUrgentDamage, urgencyScore, hasBookingIntent, bookingConfidence, and reasoning.`,
        },
        {
          role: "user",
          content: `Analyze this message:\n\nSubject: ${message.subject || "(none)"}\n\nBody: ${messageText}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  const analysisData = await analysisResponse.json();
  const intelligence = JSON.parse(analysisData.choices[0]?.message?.content || "{}");

  // Check confidence threshold
  const minConfidence = settings.ai_draft_confidence_minimum || 0.70;
  if (intelligence.confidence < minConfidence) {
    // Log that draft was not created
    await supabase.rpc("create_auto_draft", {
      p_thread_id: threadId,
      p_message_id: messageId,
      p_ai_reply_text: "Draft not created - confidence below threshold",
      p_ai_reply_subject: null,
      p_confidence: intelligence.confidence,
      p_reason: "Low confidence",
      p_category: intelligence.category || "unknown",
      p_tone: settings.ai_reply_tone_default || "professional",
      p_variants: "[]",
    });

    return new Response(
      JSON.stringify({ success: true, skipped: "Confidence below threshold" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // Generate draft reply
  const draftResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are SmartSend AI Auto-Responder for roofing companies. Generate a short, professional reply draft (2-4 sentences). Be helpful, no commitments unless asked.`,
        },
        {
          role: "user",
          content: `Generate a ${settings.ai_reply_tone_default || "professional"} reply to:\n\nSubject: ${message.subject || "(none)"}\n\nBody: ${messageText}\n\nCategory: ${intelligence.category || "general"}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    }),
  });

  const draftData = await draftResponse.json();
  const replyText = draftData.choices[0]?.message?.content?.trim() || "";
  const replySubject = message.subject ? `Re: ${message.subject.replace(/^Re:\s*/i, "")}` : null;

  // Generate variants (simplified - just generate one variant for now)
  const variants = [
    {
      tone: settings.ai_reply_tone_default || "professional",
      text: replyText,
    },
  ];

  // Create draft in database
  const { data: draftId, error: draftError } = await supabase.rpc("create_auto_draft", {
    p_thread_id: threadId,
    p_message_id: messageId,
    p_ai_reply_text: replyText,
    p_ai_reply_subject: replySubject,
    p_confidence: intelligence.confidence,
    p_reason: getReasonFromCategory(intelligence.category || "has_question", intelligence),
    p_category: intelligence.category || "has_question",
    p_tone: settings.ai_reply_tone_default || "professional",
    p_variants: JSON.stringify(variants),
  });

  if (draftError) {
    throw new Error(`Failed to create draft: ${draftError.message}`);
  }

  // Check if we should send after-hours reply
  const isAfterHours = await supabase.rpc("is_after_hours", { p_user_id: userId });
  if (isAfterHours.data && settings.after_hours_auto_responder_enabled) {
    const isUrgent = intelligence.hasUrgentDamage || intelligence.urgencyScore > 0.7;
    
    if (!isUrgent || settings.after_hours_override_urgent) {
      await supabase.rpc("send_after_hours_reply", {
        p_thread_id: threadId,
        p_message_id: messageId,
      });
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      draft_id: draftId,
      after_hours_reply_sent: isAfterHours.data && settings.after_hours_auto_responder_enabled,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

// ============================================================================
// CHECK TIMER AUTO-SENDS
// ============================================================================

async function checkTimerAutoSends(supabase: any) {
  const { data: threadsToSend, error } = await supabase.rpc("check_timer_auto_send");

  if (error) {
    throw new Error(`Failed to check timers: ${error.message}`);
  }

  const results = [];

  for (const row of threadsToSend || []) {
    // Get draft
    const { data: draft } = await supabase
      .from("auto_draft_replies")
      .select("*")
      .eq("id", row.draft_id)
      .single();

    if (!draft) continue;

    // Send the draft (this would integrate with your email sending system)
    // For now, we'll just log it
    await supabase.from("auto_reply_logs").insert({
      thread_id: row.thread_id,
      user_id: row.user_id,
      draft_id: row.draft_id,
      action_type: "timer_reply_sent",
      ai_text: draft.ai_reply_text,
      ai_subject: draft.ai_reply_subject,
      confidence: draft.confidence,
      sent_by_ai: true,
      reason: draft.reason,
      trigger_reason: "timer_expired",
    });

    // Mark draft as used
    await supabase.rpc("mark_draft_used", { p_draft_id: row.draft_id });

    results.push({
      thread_id: row.thread_id,
      draft_id: row.draft_id,
      sent: true,
    });
  }

  return new Response(
    JSON.stringify({ success: true, sent: results.length, results }),
    { headers: { "Content-Type": "application/json" } }
  );
}

// ============================================================================
// CHECK HOT LEAD ESCALATIONS
// ============================================================================

async function checkHotLeadEscalations(supabase: any) {
  const { data: escalations, error } = await supabase.rpc("check_hot_lead_escalation");

  if (error) {
    throw new Error(`Failed to check hot leads: ${error.message}`);
  }

  const results = [];

  for (const escalation of escalations || []) {
    // Log escalation (actual sending would integrate with email system)
    await supabase.from("auto_reply_logs").insert({
      thread_id: escalation.thread_id,
      user_id: escalation.user_id,
      action_type: "hot_lead_escalation_sent",
      ai_text: escalation.escalation_text,
      confidence: 0.9,
      sent_by_ai: true,
      reason: "Hot lead - no response",
      trigger_reason: "hot_lead_timeout",
    });

    results.push({
      thread_id: escalation.thread_id,
      sent: true,
    });
  }

  return new Response(
    JSON.stringify({ success: true, sent: results.length, results }),
    { headers: { "Content-Type": "application/json" } }
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getReasonFromCategory(category: string, intelligence: any): string {
  if (intelligence.hasUrgentDamage) {
    return "Urgent roof damage detected";
  }

  const reasons: Record<string, string> = {
    yes_wants_estimate: "Schedule inquiry",
    yes_come_inspect: "Inspection request",
    insurance_claim_active: "Insurance claim inquiry",
    adjuster_coming_soon: "Adjuster meeting",
    has_question: "Question asked",
    wants_pricing: "Pricing inquiry",
    wants_availability: "Availability inquiry",
    urgent_roof_damage: "Emergency repair needed",
  };

  return reasons[category] || "General inquiry";
}



















































