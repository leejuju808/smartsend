/**
 * Block 24180 — SmartSend Roofing Inbox AI v2
 * API Endpoint: Classify Inbox Message Intent
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { classifyInboxIntent } from "@/lib/ai/inboxAiV2/classifyIntent";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { messageId, messageText, subject, threadId } = body;

    if (!messageId || !messageText) {
      return NextResponse.json(
        { error: "messageId and messageText are required" },
        { status: 400 }
      );
    }

    // Get message and context
    const { data: message, error: msgError } = await supabase
      .from("inbox_messages")
      .select("*, thread_id, campaign_id, lead_id")
      .eq("id", messageId)
      .single();

    if (msgError || !message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Get previous messages for context
    const { data: previousMessages } = await supabase
      .from("inbox_messages")
      .select("direction, body, sent_at")
      .eq("thread_id", message.thread_id)
      .order("sent_at", { ascending: false })
      .limit(5);

    // Get lead context
    const { data: lead } = await supabase
      .from("leads")
      .select("stage, has_insurance_claim")
      .eq("id", message.lead_id)
      .single();

    // Classify intent
    const classification = await classifyInboxIntent(
      messageText,
      subject || message.subject,
      {
        previousMessages: previousMessages?.map(m => ({
          direction: m.direction as "in" | "out",
          body: m.body,
          sent_at: m.sent_at
        })) || [],
        leadStage: lead?.stage,
        hasInsuranceClaim: lead?.has_insurance_claim
      }
    );

    // Update message with classification
    const { error: updateError } = await supabase
      .from("inbox_messages")
      .update({
        ai_intent_label: classification.label,
        ai_intent_confidence: classification.confidence,
        ai_intent_reasoning: classification.reasoning,
        ai_emotional_tone: classification.emotionalTone,
        ai_urgency_score: classification.urgencyScore,
        ai_classified_at: new Date().toISOString()
      })
      .eq("id", messageId);

    if (updateError) {
      console.error("Error updating message classification:", updateError);
    }

    // Create speed lead record if HOT LEAD
    if (classification.label === "hot_lead") {
      await supabase
        .from("inbox_speed_leads")
        .insert({
          thread_id: message.thread_id,
          message_id: messageId,
          campaign_id: message.campaign_id,
          lead_id: message.lead_id,
          detected_at: new Date().toISOString(),
          status: "detected"
        })
        .select()
        .single();
    }

    return NextResponse.json({
      classification,
      messageId
    });

  } catch (error) {
    console.error("Error classifying inbox message:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to classify message" },
      { status: 500 }
    );
  }
}






































