/**
 * Block 24180 — SmartSend Roofing Inbox AI v2
 * Auto-Classification Webhook
 * 
 * Automatically classifies incoming messages and generates drafts
 * Called when a new inbound message arrives
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { classifyInboxIntent } from "@/lib/ai/inboxAiV2/classifyIntent";
import { generateInboxReply } from "@/lib/ai/inboxAiV2/generateReply";
import { extractFollowUpCommitments } from "@/lib/ai/inboxAiV2/followUpMemory";
import { getDefaultAccountId } from "@/lib/email/select-account";
import { sendWithAccount } from "@/lib/email/send";
import { normalizePhoneNumber, sendSMS } from "@/lib/providers/sms";

export async function POST(req: NextRequest) {
  try {
    // Use service role for webhook (no user auth required)
    const supabase = createServiceClient();
    
    const body = await req.json();
    const { messageId } = body;

    if (!messageId) {
      return NextResponse.json(
        { error: "messageId is required" },
        { status: 400 }
      );
    }

    // Get message
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

    // Only process inbound messages (support legacy variants)
    const inboundDirections = new Set(["in", "inbound", "inbound_email", "inbound_sms"]);
    if (!inboundDirections.has(String(message.direction || ""))) {
      return NextResponse.json({
        message: "Not an inbound message, skipping",
        messageId
      });
    }

    // Skip if already classified
    if (message.ai_intent_label) {
      return NextResponse.json({
        message: "Message already classified",
        messageId,
        intentLabel: message.ai_intent_label
      });
    }

    // Get context
    const { data: previousMessages } = await supabase
      .from("inbox_messages")
      .select("direction, body, sent_at")
      .eq("thread_id", message.thread_id)
      .order("sent_at", { ascending: false })
      .limit(5);

    const { data: lead } = await supabase
      .from("leads")
      .select("stage, has_insurance_claim, first_name, last_name, address")
      .eq("id", message.lead_id)
      .single();

    const { data: thread } = await supabase
      .from("inbox_threads")
      .select("assigned_to")
      .eq("id", message.thread_id)
      .single();

    // Classify intent
    const classification = await classifyInboxIntent(
      message.body,
      message.subject,
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
    await supabase
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

    // ==========================================================================
    // Block 271200 — Owner Away Mode: HOLD replies (only urgent hot escalates)
    // Block 271400 — Storm/Surge Mode: HOLD non-urgent replies (prioritize urgent/hot)
    // ==========================================================================
    const { data: wsRow } = await supabase
      .from("workspaces")
      .select("id, resilience_mode")
      .eq("id", message.workspace_id)
      .maybeSingle();
    const resilienceMode = String((wsRow as any)?.resilience_mode || "normal").toLowerCase();

    const { data: ownerAwayRow } = await supabase
      .from("owner_settings")
      .select("setting_value")
      .eq("workspace_id", message.workspace_id)
      .eq("setting_key", "owner_away")
      .maybeSingle();

    const ownerAway = (ownerAwayRow as any)?.setting_value;
    const ownerAwayEnabled = Boolean(ownerAway?.enabled);
    const ownerAwaySessionId = typeof ownerAway?.session_id === "string" ? ownerAway.session_id : null;

    const urgency = Number(classification.urgencyScore || 0);
    const isUrgentHot = classification.label === "hot_lead" && urgency >= 0.85;

    const stormOrSurge = resilienceMode === "storm" || resilienceMode === "surge";
    const shouldHold = (ownerAwayEnabled || stormOrSurge) && !isUrgentHot;

    if (shouldHold) {
      const heldReason = ownerAwayEnabled ? "owner_away" : `resilience_${resilienceMode}`;

      await supabase
        .from("inbox_messages")
        .update({
          held_for_owner: true,
          held_reason: heldReason,
          owner_away_session_id: ownerAwayEnabled ? ownerAwaySessionId : null,
        })
        .eq("id", messageId);

      // Communication continuity: always acknowledge with a clear next step (best-effort).
      // This must never break intake if sending fails.
      try {
        await maybeSendContinuityAck({
          supabase,
          message,
          classification: {
            label: classification.label,
            urgencyScore: urgency,
          },
          heldReason,
        });
      } catch {
        // swallow
      }

      return NextResponse.json({
        success: true,
        messageId,
        classification,
        held: true,
        heldReason,
        draftsGenerated: false,
        followUpTasksCreated: 0,
      });
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
        });
    }

    // Generate reply draft for HOT/WARM/QUOTE/INSPECTION intents
    if (["hot_lead", "warm_lead", "quote_request", "inspection_scheduling", "cold_reply"].includes(classification.label)) {
      // Get roofer style profile
      const assignedUserId = thread?.assigned_to;
      if (assignedUserId) {
        const { data: styleProfile } = await supabase
          .from("roofer_style_profiles")
          .select("*")
          .eq("user_id", assignedUserId)
          .eq("campaign_id", message.campaign_id)
          .single();

        let rooferStyle = styleProfile;
        if (!rooferStyle) {
          const { data: defaultProfile } = await supabase
            .from("roofer_style_profiles")
            .select("*")
            .eq("user_id", assignedUserId)
            .is("campaign_id", null)
            .single();
          
          rooferStyle = defaultProfile || undefined;
        }

        // Generate draft
        const draft = await generateInboxReply({
          intentLabel: classification.label,
          messageText: message.body,
          subject: message.subject,
          homeownerName: lead?.first_name,
          homeownerAddress: lead?.address,
          rooferStyle: rooferStyle ? {
            tone: rooferStyle.tone as any,
            signature: rooferStyle.signature || undefined,
            commonPhrases: rooferStyle.common_phrases || undefined,
            vocabularyStyle: rooferStyle.vocabulary_style as any
          } : undefined,
          previousMessages: previousMessages?.map(m => ({
            direction: m.direction as "in" | "out",
            body: m.body,
            sent_at: m.sent_at
          })) || []
        });

        // Save draft
        await supabase
          .from("inbox_ai_drafts")
          .insert({
            thread_id: message.thread_id,
            message_id: messageId,
            campaign_id: message.campaign_id,
            lead_id: message.lead_id,
            draft_subject: draft.subject,
            draft_body: draft.body,
            intent_label: classification.label,
            confidence: classification.confidence,
            tone: draft.tone,
            variant_number: 1,
            status: "draft"
          });

        // Update speed lead if exists
        if (classification.label === "hot_lead") {
          await supabase
            .from("inbox_speed_leads")
            .update({
              draft_generated_at: new Date().toISOString(),
              status: "draft_ready"
            })
            .eq("message_id", messageId);
        }
      }
    }

    // Extract follow-up commitments
    const commitments = await extractFollowUpCommitments(message.body, message.subject);
    if (commitments.length > 0 && thread?.assigned_to) {
      for (const commitment of commitments) {
        await supabase
          .from("inbox_followup_tasks")
          .insert({
            thread_id: message.thread_id,
            campaign_id: message.campaign_id,
            lead_id: message.lead_id,
            assigned_to: thread.assigned_to,
            task_type: commitment.taskType,
            trigger_text: commitment.triggerText,
            scheduled_for: commitment.scheduledFor.toISOString(),
            queued_subject: commitment.queuedSubject,
            queued_body: commitment.queuedBody,
            status: "pending"
          });
      }
    }

    // Generate booking suggestions if scheduling intent
    if (classification.label === "inspection_scheduling" || classification.label === "hot_lead") {
      // Booking suggestions will be generated on-demand when user views the message
      // We could also generate them here, but it's better to do it on-demand to get real calendar availability
    }

    return NextResponse.json({
      success: true,
      messageId,
      classification,
      draftsGenerated: ["hot_lead", "warm_lead", "quote_request", "inspection_scheduling", "cold_reply"].includes(classification.label),
      followUpTasksCreated: commitments.length
    });

  } catch (error) {
    console.error("Error auto-classifying message:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to auto-classify message" },
      { status: 500 }
    );
  }
}

async function maybeSendContinuityAck(args: {
  supabase: ReturnType<typeof createServiceClient>;
  message: any;
  classification: { label: string; urgencyScore: number };
  heldReason: string;
}) {
  const { supabase, message, heldReason } = args;

  const threadId = String(message.thread_id || "");
  if (!threadId) return;

  // Idempotency: only one ack per thread per 6 hours.
  const sinceIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: recentAck } = await supabase
    .from("inbox_messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("direction", "outbound")
    .eq("automation_tag", "continuity_ack")
    .gte("received_at", sinceIso)
    .limit(1)
    .maybeSingle();

  if (recentAck?.id) return;

  const channel = String(message.channel || "");

  const ackText =
    "Got it — thanks for reaching out.\n\nWe’ve got your message and will follow up with the next step as soon as we’re back at a desk.\n\nIf this is urgent, reply URGENT.";

  // Prefer SMS ack when this thread is SMS-based.
  const fromPhoneRaw = typeof message.from_phone === "string" ? message.from_phone : null;
  const toPhone = fromPhoneRaw ? normalizePhoneNumber(fromPhoneRaw) : null;

  if ((channel === "sms" || !!toPhone) && toPhone) {
    const { data: workspaceSettings } = await supabase
      .from("workspace_settings")
      .select("settings")
      .eq("workspace_id", message.workspace_id)
      .maybeSingle();

    const smsConfig = (workspaceSettings as any)?.settings?.sms;
    const fromPhone = smsConfig?.phone_number;
    const provider = smsConfig?.provider || "twilio";
    const credentials = smsConfig?.credentials || {};

    if (fromPhone && credentials) {
      const providerConfig = {
        provider: provider as "twilio" | "nexmo" | "telnyx",
        credentials: {
          accountSid: credentials.account_sid || credentials.accountSid || process.env.TWILIO_ACCOUNT_SID,
          authToken: credentials.auth_token || credentials.authToken || process.env.TWILIO_AUTH_TOKEN,
          phoneNumber: fromPhone,
        },
      } as const;

      if (providerConfig.credentials.accountSid && providerConfig.credentials.authToken) {
        const smsRes = await sendSMS(toPhone, ackText, providerConfig);
        if (smsRes?.success) {
          await supabase.from("inbox_messages").insert({
            thread_id: threadId,
            campaign_id: message.campaign_id,
            contact_id: message.contact_id,
            lead_id: message.lead_id,
            workspace_id: message.workspace_id,
            channel: "sms",
            direction: "outbound",
            from_phone: fromPhone,
            to_phone: toPhone,
            subject: null,
            body_raw: ackText,
            body_clean: ackText,
            received_at: new Date().toISOString(),
            status: "read",
            automation_tag: "continuity_ack",
            automation_meta: { reason: heldReason },
            sms_provider_message_id: smsRes.providerMessageId || smsRes.messageId || null,
            sms_delivery_status: "queued",
          } as any);

          await supabase
            .from("inbox_threads")
            .update({
              last_message_at: new Date().toISOString(),
              last_channel: "sms",
              last_contact_method: "sms",
              last_contact_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", threadId);
          return;
        }
      }
    }

    // If SMS is not configured or send fails, fall through to email attempt (if possible).
  }

  const fromEmailRaw = typeof message.from_email === "string" ? message.from_email : null;
  const toEmail = fromEmailRaw?.includes("@") ? fromEmailRaw : null;
  if (!toEmail) return;

  const defaultAccountId = await getDefaultAccountId(supabase, String(message.workspace_id || ""));
  if (!defaultAccountId) return;

  const subject = `Re: ${String(message.subject || "Thanks for reaching out")}`;
  const html = `<p>Got it — thanks for reaching out.</p><p>We’ve got your message and will follow up with the next step as soon as we’re back at a desk.</p><p>If this is urgent, reply <strong>URGENT</strong>.</p>`;

  await sendWithAccount(supabase as any, defaultAccountId, toEmail, subject, ackText, html);

  await supabase.from("inbox_messages").insert({
    thread_id: threadId,
    campaign_id: message.campaign_id,
    contact_id: message.contact_id,
    lead_id: message.lead_id,
    workspace_id: message.workspace_id,
    channel: "email",
    direction: "outbound",
    from_email: null,
    to_email: toEmail,
    subject,
    body_raw: html,
    body_clean: ackText,
    received_at: new Date().toISOString(),
    status: "read",
    automation_tag: "continuity_ack",
    automation_meta: { reason: heldReason },
  } as any);

  await supabase
    .from("inbox_threads")
    .update({
      last_message_at: new Date().toISOString(),
      last_channel: "email",
      last_contact_method: "email",
      last_contact_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);
}






































