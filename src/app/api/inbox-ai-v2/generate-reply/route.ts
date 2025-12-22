/**
 * Block 24180 — SmartSend Roofing Inbox AI v2
 * API Endpoint: Generate AI Reply Draft
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { generateInboxReply, generateReplyVariants } from "@/lib/ai/inboxAiV2/generateReply";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { 
      messageId, 
      threadId, 
      intentLabel, 
      messageText, 
      subject,
      generateVariants = false 
    } = body;

    if (!messageId || !threadId || !intentLabel || !messageText) {
      return NextResponse.json(
        { error: "messageId, threadId, intentLabel, and messageText are required" },
        { status: 400 }
      );
    }

    // Get message and thread context
    const { data: message } = await supabase
      .from("inbox_messages")
      .select("*, campaign_id, lead_id")
      .eq("id", messageId)
      .single();

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Get lead info
    const { data: lead } = await supabase
      .from("leads")
      .select("first_name, last_name, address")
      .eq("id", message.lead_id)
      .single();

    const homeownerName = lead?.first_name || undefined;
    const homeownerAddress = lead?.address || undefined;

    // Get previous messages for context
    const { data: previousMessages } = await supabase
      .from("inbox_messages")
      .select("direction, body, sent_at")
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: false })
      .limit(5);

    // Get roofer style profile
    const { data: styleProfile } = await supabase
      .from("roofer_style_profiles")
      .select("*")
      .eq("user_id", user.id)
      .eq("campaign_id", message.campaign_id)
      .single();

    // If no campaign-specific profile, get default
    let rooferStyle = styleProfile;
    if (!rooferStyle) {
      const { data: defaultProfile } = await supabase
        .from("roofer_style_profiles")
        .select("*")
        .eq("user_id", user.id)
        .is("campaign_id", null)
        .single();
      
      rooferStyle = defaultProfile || undefined;
    }

    // Generate reply(ies)
    const startTime = Date.now();
    
    let replies;
    if (generateVariants) {
      replies = await generateReplyVariants({
        intentLabel,
        messageText,
        subject: subject || message.subject,
        homeownerName,
        homeownerAddress,
        rooferStyle: rooferStyle ? {
          tone: rooferStyle.tone as any,
          signature: rooferStyle.signature || undefined,
          commonPhrases: rooferStyle.common_phrases || undefined,
          vocabularyStyle: rooferStyle.vocabulary_style as any,
          sampleMessages: Array.isArray(rooferStyle.sample_messages) 
            ? rooferStyle.sample_messages as any
            : undefined
        } : undefined,
        previousMessages: previousMessages?.map(m => ({
          direction: m.direction as "in" | "out",
          body: m.body,
          sent_at: m.sent_at
        })) || []
      });
    } else {
      const reply = await generateInboxReply({
        intentLabel,
        messageText,
        subject: subject || message.subject,
        homeownerName,
        homeownerAddress,
        rooferStyle: rooferStyle ? {
          tone: rooferStyle.tone as any,
          signature: rooferStyle.signature || undefined,
          commonPhrases: rooferStyle.common_phrases || undefined,
          vocabularyStyle: rooferStyle.vocabulary_style as any,
          sampleMessages: Array.isArray(rooferStyle.sample_messages) 
            ? rooferStyle.sample_messages as any
            : undefined
        } : undefined,
        previousMessages: previousMessages?.map(m => ({
          direction: m.direction as "in" | "out",
          body: m.body,
          sent_at: m.sent_at
        })) || []
      });
      replies = [reply];
    }

    const generationTime = Date.now() - startTime;

    // Save drafts to database
    const drafts = await Promise.all(
      replies.map(async (reply) => {
        const { data: draft, error: draftError } = await supabase
          .from("inbox_ai_drafts")
          .insert({
            thread_id: threadId,
            message_id: messageId,
            campaign_id: message.campaign_id,
            lead_id: message.lead_id,
            draft_subject: reply.subject,
            draft_body: reply.body,
            intent_label: intentLabel,
            confidence: reply.confidence,
            tone: reply.tone,
            variant_number: reply.variant,
            status: "draft"
          })
          .select()
          .single();

        if (draftError) {
          console.error("Error saving draft:", draftError);
        }

        return {
          ...reply,
          draftId: draft?.id
        };
      })
    );

    // Update speed lead record if exists
    if (intentLabel === "hot_lead") {
      const { data: speedLead } = await supabase
        .from("inbox_speed_leads")
        .select("id")
        .eq("message_id", messageId)
        .eq("status", "detected")
        .single();

      if (speedLead) {
        await supabase
          .from("inbox_speed_leads")
          .update({
            draft_generated_at: new Date().toISOString(),
            draft_generation_ms: generationTime,
            status: "draft_ready"
          })
          .eq("id", speedLead.id);
      }
    }

    return NextResponse.json({
      drafts,
      generationTimeMs: generationTime
    });

  } catch (error) {
    console.error("Error generating reply:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate reply" },
      { status: 500 }
    );
  }
}






































