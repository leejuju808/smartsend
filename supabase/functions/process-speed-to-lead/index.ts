// Block 8480 — Speed-to-Lead Mode v1 (Auto-Follow-Up on Hot Replies)
// Edge Function: process-speed-to-lead
// This function processes pending speed-to-lead jobs and sends follow-up emails

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env vars");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const FUNCTION_BASE_URL = `${supabaseUrl}/functions/v1`;

async function getUserDailyLimit(userId: string) {
  // BLOCK 267200: Source of truth is RPC (unpaid=25/day, paid=50/day)
  const { data: limitCheck } = await supabase.rpc("check_daily_send_limit", {
    p_user_id: userId,
    p_count: 0,
  });

  const dailyLimit = limitCheck?.[0]?.daily_limit ?? 25;
  const sendsToday = limitCheck?.[0]?.sends_today ?? 0;
  const remainingToday = limitCheck?.[0]?.remaining ?? Math.max(dailyLimit - sendsToday, 0);

  return { dailyLimit, sendsToday, remainingToday };
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // 1. Fetch pending jobs due now
    const nowIso = new Date().toISOString();

    const { data: jobs, error: jobsError } = await supabase
      .from("speed_to_lead_jobs")
      .select(
        `
        id,
        campaign_id,
        campaign_lead_id,
        lead_id,
        reply_id,
        reply_intent,
        reply_sentiment,
        thread_summary,
        scheduled_at,
        status,
        campaign:campaigns (
          id,
          owner_id,
          owner_user_id,
          user_id,
          workspace_id
        )
      `
      )
      .eq("status", "pending")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(50);

    if (jobsError) {
      console.error("Speed-to-lead: failed to fetch jobs", jobsError);
      return new Response("Error fetching jobs", { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return new Response("No jobs due", { status: 200 });
    }

    // Group by owner to check quotas
    const jobsByOwner = new Map<string, any[]>();

    for (const job of jobs) {
      const campaign = job.campaign as any;
      const ownerId =
        campaign?.owner_id || campaign?.owner_user_id || campaign?.user_id;

      if (!ownerId) {
        console.warn("Speed-to-lead: no owner found for campaign", job.campaign_id);
        continue;
      }

      if (!jobsByOwner.has(ownerId)) {
        jobsByOwner.set(ownerId, []);
      }
      jobsByOwner.get(ownerId)!.push(job);
    }

    let processedCount = 0;
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const [ownerId, ownerJobs] of jobsByOwner.entries()) {
      const { remainingToday } = await getUserDailyLimit(ownerId);

      if (remainingToday <= 0) {
        console.log("Speed-to-lead: owner at quota, skipping jobs", ownerId);
        // Mark these as skipped
        const jobIds = ownerJobs.map((j) => j.id);
        await supabase
          .from("speed_to_lead_jobs")
          .update({
            status: "skipped",
            processed_at: new Date().toISOString(),
            error: "Daily send limit reached",
          })
          .in("id", jobIds);

        skippedCount += ownerJobs.length;
        continue;
      }

      // Number we can process in this run
      const slice = ownerJobs.slice(0, remainingToday);

      for (const job of slice) {
        const jobId = job.id as string;

        try {
          // Mark processing
          await supabase
            .from("speed_to_lead_jobs")
            .update({ status: "processing" })
            .eq("id", jobId);

          // 2. Call generate-reply-draft Edge Function for this lead
          const functionUrl = `${FUNCTION_BASE_URL}/generate-reply-draft`;

          const res = await fetch(functionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              campaign_id: job.campaign_id,
              lead_id: job.lead_id,
              tone: "neutral",
              length: "short",
            }),
          });

          if (!res.ok) {
            const text = await res.text();
            console.error(
              "Speed-to-lead: generate-reply-draft failed",
              res.status,
              text
            );
            await supabase
              .from("speed_to_lead_jobs")
              .update({
                status: "failed",
                processed_at: new Date().toISOString(),
                error: `generate-reply-draft failed: ${res.status}`,
              })
              .eq("id", jobId);
            failedCount++;
            continue;
          }

          const json = await res.json();
          const subject = json.subject as string;
          const body = json.body as string;

          if (!subject || !body) {
            console.error("Speed-to-lead: missing subject or body from draft");
            await supabase
              .from("speed_to_lead_jobs")
              .update({
                status: "failed",
                processed_at: new Date().toISOString(),
                error: "Missing subject or body from draft",
              })
              .eq("id", jobId);
            failedCount++;
            continue;
          }

          // 3. Get lead email for send_queue
          const { data: lead } = await supabase
            .from("leads")
            .select("email, workspace_id")
            .eq("id", job.lead_id)
            .single();

          if (!lead || !lead.email) {
            console.error("Speed-to-lead: lead not found or missing email");
            await supabase
              .from("speed_to_lead_jobs")
              .update({
                status: "failed",
                processed_at: new Date().toISOString(),
                error: "Lead not found or missing email",
              })
              .eq("id", jobId);
            failedCount++;
            continue;
          }

          // 4. Get workspace_id from campaign or lead
          const campaign = job.campaign as any;
          const workspaceId = campaign?.workspace_id || lead.workspace_id;

          if (!workspaceId) {
            console.error("Speed-to-lead: no workspace_id found");
            await supabase
              .from("speed_to_lead_jobs")
              .update({
                status: "failed",
                processed_at: new Date().toISOString(),
                error: "No workspace_id found",
              })
              .eq("id", jobId);
            failedCount++;
            continue;
          }

          // 5. Insert into send_queue (the main queue system)
          const { data: queueRow, error: queueError } = await supabase
            .from("send_queue")
            .insert({
              workspace_id: workspaceId,
              campaign_id: job.campaign_id,
              lead_id: job.lead_id,
              to_email: lead.email,
              subject,
              body_html: body,
              status: "pending",
              scheduled_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          if (queueError || !queueRow) {
            console.error("Speed-to-lead: failed to insert send_queue", queueError);
            await supabase
              .from("speed_to_lead_jobs")
              .update({
                status: "failed",
                processed_at: new Date().toISOString(),
                error: "Failed to insert send_queue",
              })
              .eq("id", jobId);
            failedCount++;
            continue;
          }

          // 6. Mark job as sent
          await supabase
            .from("speed_to_lead_jobs")
            .update({
              status: "sent",
              processed_at: new Date().toISOString(),
              campaign_send_id: queueRow.id, // Store queue ID for reference
            })
            .eq("id", jobId);

          sentCount++;
          processedCount++;
        } catch (e) {
          console.error("Speed-to-lead: unhandled error for job", jobId, e);
          await supabase
            .from("speed_to_lead_jobs")
            .update({
              status: "failed",
              processed_at: new Date().toISOString(),
              error: `Unhandled error: ${String(e)}`,
            })
            .eq("id", jobId);
          failedCount++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        processed: processedCount,
        sent: sentCount,
        skipped: skippedCount,
        failed: failedCount,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Speed-to-lead: handler error", err);
    return new Response("Internal error", { status: 500 });
  }
});































































