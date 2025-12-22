// Worker for processing campaign_sends with sender pool integration
// This is an example integration showing how to use sender pools with campaigns

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  pickSenderFromPool,
  getSenderAccount,
  incrementSenderUsage,
  setSenderCooldown,
  logCampaignAction,
  checkBounceSpike,
} from "@/lib/senderPool";

export const runtime = "edge";

// Randomize inter-send delay 8–20s to reduce burst patterns
function getRandomDelay(): number {
  return 8000 + Math.random() * 12000; // 8-20 seconds
}

export async function POST(req: NextRequest) {
  try {
    // Get queued campaign sends (exclude paused)
    const { data: jobs, error } = await supabaseAdmin
      .from("campaign_sends")
      .select("id, campaign_id, lead_id, org_id, status")
      .eq("status", "queued")
      .or("paused.is.null,paused.eq.false")
      .order("queued_at", { ascending: true })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    let processed = 0;
    let blocked = 0;

    for (const job of jobs) {
      // Mark as sending
      await supabaseAdmin
        .from("campaign_sends")
        .update({ status: "sending" })
        .eq("id", job.id);

      try {
        // 1) Get campaign to find pool
        const { data: campaign } = await supabaseAdmin
          .from("campaigns")
          .select("id, org_id, sender_pool_id")
          .eq("id", job.campaign_id)
          .single();

        if (!campaign || !campaign.sender_pool_id) {
          await supabaseAdmin
            .from("campaign_sends")
            .update({
              status: "failed",
              error: "Campaign has no sender pool configured",
            })
            .eq("id", job.id);
          continue;
        }

        // 2) Pick a sender from the pool
        const pickRes = await pickSenderFromPool(campaign.org_id, campaign.sender_pool_id);

        if ("blocked" in pickRes && pickRes.blocked) {
          // Re-queue with delay for quiet hours/throttle
          await supabaseAdmin
            .from("campaign_sends")
            .update({
              status: "queued",
              queued_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // +5 min
            })
            .eq("id", job.id);
          blocked++;
          continue;
        }

        const senderId = (pickRes as { sender_id: string; minuteBucket: string; day: string }).sender_id;
        const { minuteBucket, day } = pickRes as { sender_id: string; minuteBucket: string; day: string };

        // 3) Load sender credentials
        const sender = await getSenderAccount(senderId);

        // 4) Load lead details
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("email, first_name, last_name, company")
          .eq("id", job.lead_id)
          .single();

        if (!lead?.email) {
          await supabaseAdmin
            .from("campaign_sends")
            .update({
              status: "failed",
              error: "Lead has no email",
            })
            .eq("id", job.id);
          continue;
        }

        // 5) Send email using sender (your provider adapter uses sender.oauth_json or smtp_json)
        // TODO: Replace this with your actual email sending logic
        // Example:
        // const sendResult = await sendEmailWithProvider({
        //   provider: sender.provider,
        //   credentials: sender.provider === 'smtp' ? sender.smtp_json : sender.oauth_json,
        //   to: lead.email,
        //   from: sender.email,
        //   fromName: sender.display_name,
        //   subject: campaign.subject,
        //   body: campaign.body_html,
        // });

        // For now, simulate success:
        await new Promise((resolve) => setTimeout(resolve, getRandomDelay()));

        // Simulate send result
        const sendResult = { ok: true, error: null };

        if (!sendResult.ok) {
          throw new Error(sendResult.error || "Send failed");
        }

        // 6) On success, increment usage
        await incrementSenderUsage(senderId, day, minuteBucket);

        // 7) Update campaign_sends status
        await supabaseAdmin
          .from("campaign_sends")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        processed++;

        // 8) Check for bounce spikes and cooldown if needed
        // TODO: Implement actual bounce detection
        // For now, this is a placeholder
        // const shouldCooldown = await checkBounceSpike(senderId);
        // if (shouldCooldown) {
        //   await setSenderCooldown(senderId, 12);
        //   await logCampaignAction(
        //     campaign.org_id,
        //     campaign.id,
        //     "sender_cooldown",
        //     { sender_id: senderId, reason: "bounce_spike" }
        //   );
        // }
      } catch (e: any) {
        console.error(`Error processing job ${job.id}:`, e);

        // Check if it's a bounce/spike issue
        // TODO: Detect bounce spikes from error
        // For now, just mark as failed
        await supabaseAdmin
          .from("campaign_sends")
          .update({
            status: "failed",
            error: e.message?.slice(0, 500) || "Unknown error",
            attempt: (job.attempt || 0) + 1,
          })
          .eq("id", job.id);
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      blocked,
    });
  } catch (e: any) {
    console.error("Worker error:", e);
    return NextResponse.json({ error: e.message || "Worker failure" }, { status: 500 });
  }
}

