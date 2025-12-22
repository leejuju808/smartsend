// supabase/functions/followup-runner/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1) Find all running campaigns
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .eq("status", "running");

  if (!campaigns || campaigns.length === 0) {
    return new Response("No campaigns running", { status: 200 });
  }

  for (const campaign of campaigns) {
    // 2) Load follow-up rules sorted by step_number
    const { data: rules } = await supabase
      .from("followup_rules")
      .select("*")
      .eq("campaign_id", campaign.id)
      .order("step_number", { ascending: true });

    if (!rules || rules.length === 0) continue;

    // 3) Load all leads who received previous steps (from send_logs - actual sent emails)
    const { data: sentEmails } = await supabase
      .from("send_logs")
      .select("lead_id, step_no, sent_at, created_at")
      .eq("campaign_id", campaign.id)
      .eq("status", "sent")
      .not("step_no", "is", null);

    // Also check send_queue for step_number (in case step_number is set but not yet in logs)
    const { data: queuedSteps } = await supabase
      .from("send_queue")
      .select("lead_id, step_number, sent_at, created_at")
      .eq("campaign_id", campaign.id)
      .not("step_number", "is", null);

    const { data: repliedRows } = await supabase
      .from("email_replies")
      .select("lead_id")
      .eq("campaign_id", campaign.id);

    const repliedSet = new Set((repliedRows ?? []).map((r) => r.lead_id));

    // Check for unsubscribed leads
    const { data: unsubscribedRows } = await supabase
      .from("leads")
      .select("id")
      .eq("unsubscribed", true);

    const unsubscribedSet = new Set((unsubscribedRows ?? []).map((r) => r.id));

    const now = new Date();

    // 4) For each step rule, decide who needs the next follow-up
    for (const rule of rules) {
      // Skip step 1 rules (follow-ups start at step 2)
      if (rule.step_number <= 1) continue;

      // leads eligible for this step:
      // - have completed step_number-1 (sent email for previous step)
      // - have not replied
      // - it's time (delay_days passed)

      const prevStep = rule.step_number - 1;

      // Combine sent emails from logs and queue
      const allSent = [
        ...(sentEmails ?? []).map((e) => ({
          lead_id: e.lead_id,
          step_number: e.step_no ?? 1, // Use step_no from send_logs, default to 1
          sent_at: e.sent_at,
          created_at: e.created_at,
        })),
        ...(queuedSteps ?? []).map((q) => ({
          lead_id: q.lead_id,
          step_number: q.step_number ?? 1,
          sent_at: q.sent_at,
          created_at: q.created_at,
        })),
      ];

      // Group by lead_id and get the max step_number for each lead
      const leadMaxStep = new Map<string, { step_number: number; sent_at: string | null; created_at: string }>();
      for (const item of allSent) {
        const existing = leadMaxStep.get(item.lead_id);
        if (!existing || item.step_number > existing.step_number) {
          leadMaxStep.set(item.lead_id, {
            step_number: item.step_number,
            sent_at: item.sent_at,
            created_at: item.created_at,
          });
        }
      }

      const eligible = Array.from(leadMaxStep.entries())
        .filter(([leadId, data]) => {
          if (data.step_number !== prevStep) return false;
          if (repliedSet.has(leadId)) return false;
          if (unsubscribedSet.has(leadId)) return false;

          // Use sent_at if available, otherwise use created_at
          const sentAt = data.sent_at ? new Date(data.sent_at) : new Date(data.created_at);
          const due = new Date(sentAt.getTime() + rule.delay_days * 86400 * 1000);

          return now >= due;
        })
        .map(([leadId]) => ({ lead_id: leadId }));

      if (eligible.length === 0) continue;

      // Global Usage Guard Check (Block 293) - Check before creating follow-up sends
      const workspaceId = campaign.workspace_id;
      let guardStatus: string | null = null;
      
      if (workspaceId) {
        const { data: guard } = await supabase
          .from("billing_global_guard")
          .select("*")
          .eq("workspace_id", workspaceId)
          .maybeSingle();

        if (guard) {
          // Compute guard status
          if (guard.seats_over_cap) {
            guardStatus = "blocked_seat_limit";
          } else if (guard.sends_over_cap && guard.credits_empty) {
            guardStatus = "blocked_sends_no_credits";
          }
        }
      }

      // If guard blocks sends, log skips instead of queuing
      if (guardStatus === "blocked_seat_limit" || guardStatus === "blocked_sends_no_credits") {
        // Log follow-up skips
        const skipInserts = eligible.map((row) => ({
          workspace_id: workspaceId,
          lead_id: row.lead_id,
          campaign_id: campaign.id,
          reason: guardStatus!,
        }));

        // Insert skips in batches
        const chunk = 500;
        for (let i = 0; i < skipInserts.length; i += chunk) {
          const slice = skipInserts.slice(i, i + chunk);
          await supabase.from("followup_skips").insert(slice).catch((err) => {
            console.error("Insert followup skip failed:", err.message);
          });
        }

        // Log billing event
        await supabase.from("billing_events").insert({
          workspace_id: workspaceId,
          type: "followup_blocked",
          detail: `Follow-up skipped: ${guardStatus}`
        }).catch((err) => {
          console.error("Insert billing event failed:", err.message);
        });

        // Log to workspace_activity (only log once per campaign, not per lead)
        await supabase.from("workspace_activity").insert({
          workspace_id: workspaceId,
          actor_id: null,
          event_type: "billing_limit_hit",
          description: `Follow-ups blocked due to ${guardStatus}`,
          campaign_id: campaign.id,
          metadata: { guard_status: guardStatus, skipped_count: eligible.length },
        }).catch(() => {}); // Ignore errors to avoid blocking follow-ups

        // Skip creating send_queue entries
        continue;
      }

      // 5) Create new send_queue entries for this follow-up step
      const inserts = eligible.map((row) => ({
        campaign_id: campaign.id,
        account_id: campaign.account_id,
        lead_id: row.lead_id,
        status: "pending",
        step_number: rule.step_number,
        step_no: rule.step_number, // Also set step_no for compatibility
      }));

      // Insert in batches
      const chunk = 500;
      for (let i = 0; i < inserts.length; i += chunk) {
        const slice = inserts.slice(i, i + chunk);
        const { error } = await supabase.from("send_queue").insert(slice);
        if (error) {
          console.error("Insert follow-up failed:", error.message);
        }
      }

      // 6) Kick the send-runner to deliver these
      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-runner`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get(
              "SUPABASE_SERVICE_ROLE_KEY"
            )}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ campaignId: campaign.id }),
        }
      );
    }
  }

  return new Response("Follow-up cycle processed", { status: 200 });
});

