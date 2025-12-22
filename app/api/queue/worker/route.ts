/**
 * Block 10700 — SmartSend Scheduler & Send Queue v1
 * Queue Worker: Processes send_queue every minute
 * 
 * This is the heartbeat of SmartSend - it processes all queued emails
 * and sends them via the email provider.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  sendEmail,
  logEvent,
  checkSafetyRules,
  checkRateLimit,
  getRandomDelay,
} from "@/lib/queue/scheduler";

export const runtime = "nodejs";
export const maxDuration = 60; // 60 seconds max execution time

// Safety limits
const MAX_BATCH_SIZE = 50; // Process max 50 emails per run
const MAX_SENDS_PER_HOUR = 60;

export async function POST(req: NextRequest) {
  try {
    const supabase = createServiceClient();
    const now = new Date();

    // 1. Fetch all queue rows where sent = false and send_at <= now()
    const { data: queueItems, error: fetchError } = await supabase
      .from("send_queue")
      .select(
        `
        id,
        user_id,
        campaign_id,
        contact_id,
        message_body,
        subject,
        sequence_step,
        step_label,
        attempts,
        max_attempts
      `
      )
      .eq("sent", false)
      .eq("status", "queued")
      .lte("send_at", now.toISOString())
      .order("send_at", { ascending: true })
      .limit(MAX_BATCH_SIZE);

    if (fetchError) {
      console.error("[Queue Worker] Error fetching queue:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch queue", details: fetchError.message },
        { status: 500 }
      );
    }

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        message: "No items to process",
      });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let rateLimited = 0;

    // Group by user_id to check rate limits per user
    const userGroups = new Map<string, typeof queueItems>();
    for (const item of queueItems) {
      const userId = item.user_id;
      if (!userGroups.has(userId)) {
        userGroups.set(userId, []);
      }
      userGroups.get(userId)!.push(item);
    }

    // Process each user's queue items
    for (const [userId, items] of userGroups.entries()) {
      // Check rate limit for this user
      const rateLimit = await checkRateLimit(supabase, userId);
      if (!rateLimit.allowed) {
        console.log(`[Queue Worker] Rate limit reached for user ${userId}`);
        rateLimited += items.length;
        continue;
      }

      // Check safety rules
      const safety = await checkSafetyRules(supabase, userId, items[0]?.campaign_id);
      if (!safety.safe) {
        console.log(`[Queue Worker] Safety check failed: ${safety.reason}`);
        skipped += items.length;
        continue;
      }

      // Process items for this user
      for (const item of items) {
        // Check if sequence should still send (contact might have replied)
        if (item.sequence_step > 1) {
          // For follow-ups, check if contact has replied
          const { data: hasReply } = await supabase
            .from("activity_logs")
            .select("id")
            .eq("campaign_id", item.campaign_id)
            .eq("contact_id", item.contact_id)
            .eq("event_type", "reply_received")
            .limit(1)
            .maybeSingle();

          if (hasReply) {
            // Cancel this follow-up
            await supabase
              .from("send_queue")
              .update({
                status: "canceled",
                error: "Contact replied - sequence stopped",
              })
              .eq("id", item.id);

            await logEvent(supabase, {
              userId: item.user_id,
              campaignId: item.campaign_id,
              contactId: item.contact_id,
              eventType: "sequence_stopped",
              message: `Follow-up canceled - contact replied`,
              meta: { sequence_step: item.sequence_step },
            });

            skipped++;
            continue;
          }
        }

        // Get A/B variant ID if exists
        const { data: queueItem } = await supabase
          .from("send_queue")
          .select("ab_variant_id")
          .eq("id", item.id)
          .single();

        // Mark as sending
        await supabase
          .from("send_queue")
          .update({
            status: "sending",
            attempts: (item.attempts || 0) + 1,
          })
          .eq("id", item.id);

        try {
          // Get contact email
          const { data: contact, error: contactError } = await supabase
            .from("contacts")
            .select("email, first_name, last_name")
            .eq("id", item.contact_id)
            .single();

          if (contactError || !contact || !contact.email) {
            throw new Error("Contact email not found");
          }

          // Apply random delay (6-18 seconds) for deliverability
          const delay = getRandomDelay();
          await new Promise((resolve) => setTimeout(resolve, delay * 1000));

          // Send email
          const sendResult = await sendEmail(supabase, {
            queueId: item.id,
            to: contact.email,
            subject: item.subject || "No subject",
            html: item.message_body,
          });

          if (sendResult.success) {
            // Mark as sent
            await supabase
              .from("send_queue")
              .update({
                sent: true,
                status: "sent",
                sent_at: new Date().toISOString(),
                provider_message_id: sendResult.messageId,
                error: null,
              })
              .eq("id", item.id);

            // Track A/B test send if variant exists
            if (queueItem?.ab_variant_id) {
              await supabase.rpc("increment_ab_metric", {
                p_variant_id: queueItem.ab_variant_id,
                p_metric_type: "send",
                p_increment: 1,
              }).catch(err => console.error("Failed to track A/B send:", err));
            }

            // Log event
            await logEvent(supabase, {
              userId: item.user_id,
              campaignId: item.campaign_id,
              contactId: item.contact_id,
              eventType: "message_sent",
              message: `Message sent to ${contact.first_name || contact.email}`,
              meta: {
                sequence_step: item.sequence_step,
                step_label: item.step_label,
                provider_message_id: sendResult.messageId,
                ab_variant_id: queueItem?.ab_variant_id || null,
              },
            });

            sent++;
          } else {
            throw new Error(sendResult.error || "Send failed");
          }
        } catch (error: any) {
          const errorMessage = error.message || String(error);
          const attempts = (item.attempts || 0) + 1;
          const maxAttempts = item.max_attempts || 3;

          if (attempts >= maxAttempts) {
            // Max attempts reached - mark as failed
            await supabase
              .from("send_queue")
              .update({
                status: "failed",
                error: errorMessage,
                attempts,
              })
              .eq("id", item.id);

            await logEvent(supabase, {
              userId: item.user_id,
              campaignId: item.campaign_id,
              contactId: item.contact_id,
              eventType: "message_failed",
              message: `Failed to send after ${attempts} attempts: ${errorMessage}`,
              meta: { attempts, max_attempts: maxAttempts },
            });

            failed++;
          } else {
            // Retry later (exponential backoff)
            const backoffSeconds = Math.pow(2, attempts) * 60; // 2min, 4min, 8min
            const nextRetry = new Date();
            nextRetry.setSeconds(nextRetry.getSeconds() + backoffSeconds);

            await supabase
              .from("send_queue")
              .update({
                status: "queued",
                error: errorMessage,
                attempts,
                next_retry_at: nextRetry.toISOString(),
                send_at: nextRetry.toISOString(), // Reschedule
              })
              .eq("id", item.id);

            skipped++; // Count as skipped for this run
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      processed: queueItems.length,
      sent,
      failed,
      skipped,
      rateLimited,
      timestamp: now.toISOString(),
    });
  } catch (error: any) {
    console.error("[Queue Worker] Unexpected error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}

// GET endpoint for health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "SmartSend Queue Worker",
    version: "1.0.0",
    status: "operational",
  });
}

