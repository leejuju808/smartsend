import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/sendEmail.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const CLAIM = 100;

type QueueEmail = {
  id: string;
  campaign_id: string;
  account_id: string;
  provider: string;
  to_email?: string;
  to?: string;
  subject?: string;
  subject_template?: string;
  body_html?: string;
  body_html_template?: string;
  status?: string;
  locked_at?: string | null;
};

type QuotaTracker = {
  id: string;
  account_id: string;
  provider: string;
  date: string;
  sent_count: number;
  quota_limit: number;
};

type QuotaCheckResult = {
  allowed: boolean;
  reason?: string;
  workspaceRemaining?: number;
  senderRemaining?: number;
};

// Token bucket helper: returns true if N tokens were granted
async function tokenTake(account_id: string, provider: "gmail" | "outlook", n = 1): Promise<boolean> {
  const { data, error } = await supabase.rpc("ratebucket_take", { 
    p_account: account_id, 
    p_provider: provider, 
    p_n: n 
  });
  if (error) {
    console.error("ratebucket_take error", error);
    return false;
  }
  return !!data;
}

async function getQuotaTracker(
  accountId: string,
  provider: string,
  date: string
): Promise<QuotaTracker | null> {
  const { data, error } = await supabase
    .from("send_quota_trackers")
    .select("*")
    .eq("account_id", accountId)
    .eq("provider", provider)
    .eq("date", date)
    .maybeSingle();

  if (error) {
    console.error("Error fetching quota tracker:", error);
    return null;
  }

  return data;
}

async function upsertQuotaTracker(
  accountId: string,
  provider: string,
  date: string,
  sentCount: number,
  quotaLimit: number = 2000
): Promise<void> {
  const { error } = await supabase
    .from("send_quota_trackers")
    .upsert({
      account_id: accountId,
      provider: provider,
      date: date,
      sent_count: sentCount,
      quota_limit: quotaLimit,
      reset_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, {
      onConflict: "account_id,date,provider",
    });

  if (error) {
    console.error("Error upserting quota tracker:", error);
    throw error;
  }
}

// Block 335: Check workspace and sender billing quotas
async function checkSendQuotaEdge(opts: {
  workspaceId: string;
  senderId?: string | null;
}): Promise<QuotaCheckResult> {
  const { workspaceId, senderId } = opts;

  // 1) Get limits
  const { data: limits, error: limitsErr } = await supabase
    .from("workspace_billing_limits")
    .select(
      "daily_send_cap, per_sender_daily_cap, hard_stop"
    )
    .eq("workspace_id", workspaceId)
    .single();

  // If no limits row yet, treat as unlimited for now
  if (limitsErr || !limits) {
    return { allowed: true };
  }

  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  ).toISOString();
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  ).toISOString();

  // 2) Workspace sends today (via campaigns)
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId);

  const campaignIds = campaigns?.map(c => c.id) || [];

  let wsCount = 0;
  if (campaignIds.length > 0) {
    const { count } = await supabase
      .from("send_logs")
      .select("id", { head: true, count: "exact" })
      .in("campaign_id", campaignIds)
      .eq("status", "sent")
      .gte("sent_at", startOfDay)
      .lte("sent_at", endOfDay);

    wsCount = count ?? 0;
  }

  const workspaceRemaining = Math.max(
    0,
    limits.daily_send_cap - wsCount
  );

  // 3) Sender sends today (if provided)
  let senderRemaining: number | undefined;
  if (senderId) {
    const { count: senderCount } = await supabase
      .from("send_logs")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", senderId)
      .eq("status", "sent")
      .gte("sent_at", startOfDay)
      .lte("sent_at", endOfDay);

    senderRemaining = Math.max(
      0,
      limits.per_sender_daily_cap - (senderCount ?? 0)
    );
  }

  // 4) Decide
  const workspaceOver = workspaceRemaining <= 0;
  const senderOver =
    typeof senderRemaining === "number" && senderRemaining <= 0;

  if (!workspaceOver && !senderOver) {
    return { allowed: true, workspaceRemaining, senderRemaining };
  }

  const reason = workspaceOver
    ? "workspace_daily_cap_reached"
    : "sender_daily_cap_reached";

  if (!limits.hard_stop) {
    // we just warn (UI can show reason, but dispatcher keeps going)
    return { allowed: true, reason, workspaceRemaining, senderRemaining };
  }

  return { allowed: false, reason, workspaceRemaining, senderRemaining };
}


async function claimBatch() {
  const { data, error } = await supabase.rpc("claim_send_batch", { p_limit: CLAIM });
  if (error) {
    console.error("claim_send_batch error", error);
    return [];
  }
  return data ?? [];
}

export async function handler() {
  const batch = await claimBatch();
  if (!batch.length) return new Response("No work", { status: 200 });

  const today = new Date().toISOString().slice(0,10);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const email of batch) {
    try {
      // Warmup cap check (Block 112 compatible)
      let prof: { daily_ramp_cap: number; enabled: boolean } | null = null;
      const { data: warmupProf } = await supabase
        .from("account_warmup_profiles")
        .select("daily_ramp_cap, enabled")
        .eq("account_id", email.account_id)
        .maybeSingle();

      prof = warmupProf;

      if (prof?.enabled) {
        const { data: today } = await supabase
          .from("warmup_history")
          .select("sent_count")
          .eq("account_id", email.account_id)
          .eq("date", today)
          .maybeSingle();

        if ((today?.sent_count ?? 0) >= (prof.daily_ramp_cap ?? 99999)) {
          console.log(`Warmup cap reached for account ${email.account_id} — skip dispatch until tomorrow`);
          await supabase.from("send_queue").update({
            status: "pending", locked_at: null
          }).eq("id", email.id);
          skipped++;
          continue;
        }
      }

      // Block 335: Billing quota check (workspace + sender caps)
      // Get workspace_id from campaign
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("workspace_id")
        .eq("id", email.campaign_id)
        .maybeSingle();

      if (campaign?.workspace_id) {
        const quota = await checkSendQuotaEdge({
          workspaceId: campaign.workspace_id,
          senderId: email.account_id,
        });

        if (!quota.allowed) {
          console.log(
            "Quota hit, stopping sends for workspace",
            campaign.workspace_id,
            "reason",
            quota.reason
          );

          // Mark campaign over_quota to inform UI
          await supabase
            .from("campaigns")
            .update({ over_quota: true, status: "paused" })
            .eq("id", email.campaign_id)
            .catch((err) => {
              console.error("Failed to mark campaign over_quota", err);
            });

          // Park queue item back to pending
          await supabase.from("send_queue").update({
            status: "pending",
            locked_at: null,
            last_error: `quota_exceeded:${quota.reason}`
          }).eq("id", email.id);
          skipped++;
          continue;
        }

        // Block 427: Custom Sending Windows - Check if current time is within allowed window
        const { data: withinWindow } = await supabase.rpc('is_within_sending_window', {
          p_workspace_id: campaign.workspace_id,
          p_campaign_id: email.campaign_id,
          p_check_time: new Date().toISOString()
        });

        if (!withinWindow) {
          // Outside sending window - reschedule for next valid time
          const { data: nextValidTime } = await supabase.rpc('get_next_valid_send_time', {
            p_workspace_id: campaign.workspace_id,
            p_campaign_id: email.campaign_id,
            p_current_time: new Date().toISOString()
          });

          if (nextValidTime) {
            await supabase.from("send_queue").update({
              status: "pending",
              locked_at: null,
              scheduled_at: nextValidTime,
              last_error: "outside_sending_window"
            }).eq("id", email.id);
            skipped++;
            continue;
          }
        }
      }

      // Daily cap check (Block 112)
      const { data: quota } = await supabase
        .from("send_quota_trackers")
        .select("sent_count, quota_limit")
        .eq("account_id", email.account_id)
        .eq("provider", email.provider)
        .eq("date", today)
        .maybeSingle();

      if (quota && quota.sent_count >= quota.quota_limit) {
        // park it back to pending; let tomorrow pick it up
        await supabase.from("send_queue").update({
          status: "pending", locked_at: null
        }).eq("id", email.id);
        skipped++;
        continue;
      }

      // Token bucket check
      const ok = await tokenTake(email.account_id, email.provider as "gmail" | "outlook", 1);
      if (!ok) {
        // Not enough tokens yet → park back to pending
        await supabase.from("send_queue").update({
          status: "pending", locked_at: null
        }).eq("id", email.id);
        skipped++;
        continue;
      }

      // Pre-send guard: check if recipient is suppressed (Block 117)
      const recipientEmail = email.to_email || email.to || "";
      const { data: suppressed } = await supabase.rpc('is_suppressed', {
        p_account: email.account_id,
        p_email: recipientEmail
      });
      if (suppressed === true) {
        await supabase.from("send_queue").update({
          status: "dead_letter",
          locked_at: null,
          last_error: "suppressed:precheck"
        }).eq("id", email.id);
        skipped++;
        continue;
      }

      // Preflight gate: check email content, links, warmup, etc.
      const { data: decision } = await supabase.rpc('preflight_apply', { p_queue_id: email.id });
      if (decision && decision !== 'allow') {
        // Held: do not send; leave in 'held_preflight' with reasons
        await supabase.from("send_queue").update({
          locked_at: null
        }).eq("id", email.id);
        skipped++;
        continue;
      }

      // Sender-side guard: fail fast if sender domain is unhealthy
      const senderEmail = email.from_address || email.from_email || email.sender_email || "";
      const senderDomain = senderEmail.split("@")[1]?.toLowerCase();
      if (senderDomain) {
        const { data: dh } = await supabase
          .from("domain_health")
          .select("*")
          .eq("domain", senderDomain)
          .maybeSingle();
        if (dh && (dh.blocklisted || dh.reputation === "bad" || dh.spf_ok === false || dh.dkim_ok === false)) {
          // hold for triage (deliverability issue)
          await supabase.from("send_queue").update({
            status: "held_preflight",
            preflight_decision: "hold",
            preflight_reasons: ["domain_unhealthy"],
            held_at: new Date().toISOString(),
            locked_at: null
          }).eq("id", email.id);
          skipped++;
          continue;
        }
      }

      const result = await sendEmail({
        provider: email.provider as "gmail" | "outlook",
        to: email.to_email || email.to || "",
        subject: email.subject || "",
        body_html: email.body_html || "",
        account_id: email.account_id,
        campaign_id: email.campaign_id,
        queue_id: email.id
      });

      if (result.success) {
        await supabase.from("send_queue").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          locked_at: null,
          last_error: null
        }).eq("id", email.id);

        await supabase.from("send_quota_trackers").upsert({
          account_id: email.account_id,
          provider: email.provider,
          date: today,
          sent_count: (quota?.sent_count || 0) + 1
        });

        // Update warmup_history sent_count for today
        if (prof?.enabled) {
          const { data: todayHistory } = await supabase
            .from("warmup_history")
            .select("sent_count")
            .eq("account_id", email.account_id)
            .eq("date", today)
            .maybeSingle();

          await supabase.from("warmup_history").upsert({
            account_id: email.account_id,
            date: today,
            sent_count: (todayHistory?.sent_count || 0) + 1,
            delivered: (todayHistory?.delivered || 0) + 1,
          }, {
            onConflict: "account_id,date"
          });
        }

        processed++;
      } else {
        const n = result.normalized;
        const baseUpdate = {
          locked_at: null,
          last_error: `${n.kind}:${result.error}`,
          attempt_count: (email.attempt_count ?? 0) + 1
        };

        if (n.action === 'suppress_recipient' || n.action === 'dead_letter') {
          // Auto-suppress on hard bounce (Block 117)
          if (n.action === 'suppress_recipient') {
            const recipientEmail = email.to_email || email.to || "";
            await supabase.rpc('suppress_email', {
              p_scope: 'account',
              p_account: email.account_id,
              p_email: recipientEmail,
              p_provider: email.provider,
              p_reason: 'invalid_recipient',
              p_notes: 'Auto-suppressed by hard bounce'
            }).catch((err) => {
              console.error("Failed to suppress email:", err);
            });
          }
          await supabase.from("send_queue").update({ 
            status: "dead_letter", 
            ...baseUpdate,
            last_error: `suppressed:${result.error}`
          }).eq("id", email.id);
        } else if (n.action === 'pause_account') {
          await supabase.from("accounts").update({ 
            sending_paused: true, 
            paused_reason: n.kind 
          }).eq("id", email.account_id);
          await supabase.from("send_queue").update({ 
            status: "dead_letter", 
            ...baseUpdate 
          }).eq("id", email.id);
        } else if (n.action === 'escalate') {
          await supabase.from("send_queue").update({ 
            status: "dead_letter", 
            ...baseUpdate 
          }).eq("id", email.id);
        } else {
          // Retry path: use smart retry windows (Block 119)
          const attempts = (email.attempt_count ?? 0) + 1;
          const kind = result.normalized?.kind ?? 'server_error';
          const { data: nextAt } = await supabase.rpc('compute_next_retry_at', {
            p_account: email.account_id,
            p_provider: email.provider,
            p_recipient: recipientEmail,
            p_attempt: attempts,
            p_error_kind: kind
          });
          
          await supabase.from("send_queue").update({
            status: "failed",
            next_attempt_at: nextAt ?? new Date(Date.now() + 10 * 60_000).toISOString(),
            ...baseUpdate
          }).eq("id", email.id);
        }
        failed++;
      }
    } catch (e) {
      const attempts = (email.attempt_count ?? 0) + 1;
      const recipientEmail = email.to_email || email.to || "";
      const { data: nextAt } = await supabase.rpc('compute_next_retry_at', {
        p_account: email.account_id,
        p_provider: email.provider,
        p_recipient: recipientEmail,
        p_attempt: attempts,
        p_error_kind: 'server_error'
      });
      
      await supabase.from("send_queue").update({
        status: "failed",
        last_error: e instanceof Error ? e.message : String(e),
        locked_at: null,
        attempt_count: attempts,
        next_attempt_at: nextAt ?? new Date(Date.now() + 10 * 60_000).toISOString()
      }).eq("id", email.id);
      failed++;
    }
  }

  return new Response(`Dispatched ${batch.length}`, { status: 200 });
}

Deno.serve(handler);

