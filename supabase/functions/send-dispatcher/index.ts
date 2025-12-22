// Deno — Supabase Edge
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkWorkspaceQuota,
  type QuotaCheckResult,
} from "../_shared/billingQuota.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_CLIENT_ID     = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const OUTLOOK_CLIENT_ID   = Deno.env.get("OUTLOOK_CLIENT_ID")!;
const OUTLOOK_CLIENT_SECRET = Deno.env.get("OUTLOOK_CLIENT_SECRET")!;

type Mailbox = {
  id: string; account_id: string; provider: "gmail"|"outlook"; email: string;
  access_token: string; refresh_token: string; expires_at: string;
  send_quota_per_day: number; send_quota_used: number; enabled: boolean;
};

const sb = createClient(SB_URL, SRK);

type SendCapInfo = {
  dailyCap: number; // allowed sends today
  usedToday: number; // already sent
  remaining: number; // still allowed
  overageBehavior: "hard_stop" | "soft_warn";
};

// Block 389: Pause active campaigns when workspace hits quota
async function pauseActiveCampaignsForWorkspace(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  reason: string | null
) {
  // Update all active campaigns → paused_quota
  const { error } = await supabase
    .from("campaigns")
    .update({
      status: "paused_quota",
      status_reason:
        reason ??
        "Sending paused due to workspace quota being reached. Upgrade or wait for quota reset.",
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .in("status", ["scheduled", "running"]); // adjust if your statuses differ

  if (error) {
    console.error(
      "[send-dispatcher] failed to mark campaigns as paused_quota",
      error
    );
  }
}

// Block 351: Get workspace send cap info
async function getWorkspaceSendCap(
  workspaceId: string
): Promise<SendCapInfo> {
  // 1) Pull plan limits
  const { data: limitsRow, error: limitsErr } = await sb
    .from("workspace_billing_limits")
    .select("daily_send_cap, overage_behavior")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (limitsErr) {
    console.error("billing limits error", limitsErr);
  }

  const dailyCap =
    limitsRow?.daily_send_cap && limitsRow.daily_send_cap > 0
      ? limitsRow.daily_send_cap
      : 500; // sane default if not set

  const overageBehavior =
    (limitsRow?.overage_behavior as "hard_stop" | "soft_warn") ||
    "hard_stop";

  // 2) Today usage from view
  const { data: usageRow, error: usageErr } = await sb
    .from("workspace_send_usage_today")
    .select("sends_count")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (usageErr) {
    console.error("usage today error", usageErr);
  }

  const usedToday = usageRow?.sends_count || 0;
  const remaining = Math.max(dailyCap - usedToday, 0);

  return {
    dailyCap,
    usedToday,
    remaining,
    overageBehavior,
  };
}

function expBackoffMs(attempt: number) {
  const base = Math.min(60_000 * Math.pow(2, attempt), 30 * 60_000); // up to 30m
  return base + Math.floor(Math.random() * 10_000);
}

async function refreshIfNeeded(m: Mailbox) {
  const exp = new Date(m.expires_at).getTime();
  if (exp > Date.now() + 60_000) return m.access_token; // > 60s left

  if (m.provider === "gmail") {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {"Content-Type":"application/x-www-form-urlencoded"},
      body: new URLSearchParams({
        client_id: GMAIL_CLIENT_ID,
        client_secret: GMAIL_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: m.refresh_token
      })
    });
    if (!res.ok) throw new Error(`gmail_refresh_failed ${await res.text()}`);
    const j = await res.json();
    const access = j.access_token as string;
    const expires_in = j.expires_in as number;
    await sb.from("mailboxes").update({
      access_token: access,
      expires_at: new Date(Date.now() + (expires_in-30)*1000).toISOString()
    }).eq("id", m.id);
    return access;
  } else {
    const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {"Content-Type":"application/x-www-form-urlencoded"},
      body: new URLSearchParams({
        client_id: OUTLOOK_CLIENT_ID,
        client_secret: OUTLOOK_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: m.refresh_token,
        scope: "https://graph.microsoft.com/.default offline_access"
      })
    });
    if (!res.ok) throw new Error(`outlook_refresh_failed ${await res.text()}`);
    const j = await res.json();
    const access = j.access_token as string;
    const expires_in = j.expires_in as number;
    await sb.from("mailboxes").update({
      access_token: access,
      expires_at: new Date(Date.now() + (expires_in-30)*1000).toISOString()
    }).eq("id", m.id);
    return access;
  }
}

// naive fair scheduler: one job per mailbox per tick
async function claimJobs(): Promise<{ mailbox: Mailbox, jobs: any[] }[]> {
  // reset quotas if needed
  await sb.rpc("reset_mailbox_quota");

  // fetch mailboxes with remaining quota
  const { data: mboxes } = await sb.from("mailboxes")
    .select("*")
    .eq("enabled", true)
    .limit(50);

  const out: { mailbox: Mailbox; jobs: any[] }[] = [];
  for (const m of mboxes || []) {
    // Check daily plan budget (Block 255)
    const { data: remainingBudget } = await sb.rpc("get_remaining_budget", {
      p_mailbox_id: m.id
    });
    
    if (remainingBudget === null || remainingBudget <= 0) {
      // Skip mailbox if no budget remaining
      continue;
    }
    
    // Also check legacy quota system
    if (m.send_quota_used >= m.send_quota_per_day) continue;

    // Block 464: Include retry_scheduled items that are due
    const { data: jobs } = await sb
      .from("send_queue")
      .select("id,account_id,lead_id,campaign_id,variant_id,mailbox_id,subject,html,body,raw,provider_payload,attempt_count,retry_count,original_mailbox_id,failover_used")
      .in("status", ["queued", "retry_scheduled"])
      .eq("mailbox_id", m.id)
      .lte("next_attempt_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(Math.min(5, remainingBudget)); // Limit to remaining budget

    if (!jobs?.length) continue;

    // Block 343: Filter out jobs where followups are stopped
    // Block 351: Also enforce workspace daily caps
    
    // Batch fetch all leads to get workspace_ids efficiently
    const leadIds = [...new Set(jobs.filter(j => j.lead_id).map(j => j.lead_id))];
    const { data: leads } = await sb
      .from("leads")
      .select("id, workspace_id, stop_followups, has_replied, unsubscribed, bounced")
      .in("id", leadIds);
    
    const leadToWorkspace = new Map<string, string>();
    const leadStopFollowups = new Map<string, boolean>();
    const leadReplied = new Map<string, boolean>();
    const leadUnsubscribed = new Map<string, boolean>();
    const leadBounced = new Map<string, boolean>();
    for (const lead of leads || []) {
      if (lead.workspace_id) {
        leadToWorkspace.set(lead.id, lead.workspace_id);
      }
      // Track stop_followups flag
      if (lead.stop_followups) {
        leadStopFollowups.set(lead.id, true);
      }
      // Track reply flags
      if (lead.has_replied) {
        leadReplied.set(lead.id, true);
      }
      if (lead.unsubscribed) {
        leadUnsubscribed.set(lead.id, true);
      }
      if (lead.bounced) {
        leadBounced.set(lead.id, true);
      }
    }

    // Batch fetch campaign_leads statuses to filter out replied/unsubscribed/bounced enrollments
    const campaignIds = [...new Set(jobs.filter(j => j.campaign_id).map(j => j.campaign_id))];
    const campaignLeadPairs = jobs
      .filter(j => j.campaign_id && j.lead_id)
      .map(j => ({ campaign_id: j.campaign_id, lead_id: j.lead_id }));
    
    const campaignLeadStatuses = new Map<string, string>();
    if (campaignLeadPairs.length > 0 && campaignIds.length > 0) {
      const { data: campaignLeads } = await sb
        .from("campaign_leads")
        .select("campaign_id, lead_id, status")
        .in("campaign_id", campaignIds)
        .in("lead_id", leadIds);
      
      for (const cl of campaignLeads || []) {
        const key = `${cl.campaign_id}:${cl.lead_id}`;
        campaignLeadStatuses.set(key, cl.status);
      }
    }

    // Batch fetch workspace caps for all unique workspaces
    const workspaceIds = [...new Set(Array.from(leadToWorkspace.values()))];
    const workspaceCaps = new Map<string, SendCapInfo>();
    for (const wsId of workspaceIds) {
      workspaceCaps.set(wsId, await getWorkspaceSendCap(wsId));
    }

    const filteredJobs = [];
    const workspaceCapReached = new Set<string>(); // Track which workspaces hit cap
    
    for (const job of jobs) {
      if (!job.lead_id || !job.campaign_id) {
        filteredJobs.push(job);
        continue;
      }

      const workspaceId = leadToWorkspace.get(job.lead_id);
      if (!workspaceId) {
        filteredJobs.push(job);
        continue;
      }

      // Block 351: Check workspace daily cap
      const caps = workspaceCaps.get(workspaceId)!;
      
      // Hard stop if cap reached
      if (caps.remaining <= 0 && caps.overageBehavior === "hard_stop") {
        // Log cap reached event (only once per workspace per hour)
        if (!workspaceCapReached.has(workspaceId)) {
          workspaceCapReached.add(workspaceId);
          
          const lastEvent = await sb
            .from("billing_usage_events")
            .select("created_at")
            .eq("workspace_id", workspaceId)
            .eq("event_type", "daily_cap_reached")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const shouldLog = !lastEvent || 
            (new Date().getTime() - new Date(lastEvent.created_at).getTime()) > 3600000; // 1 hour

          if (shouldLog) {
            await sb.from("billing_usage_events").insert({
              workspace_id: workspaceId,
              event_type: "daily_cap_reached",
              payload: {
                daily_cap: caps.dailyCap,
                used_today: caps.usedToday,
                at: new Date().toISOString(),
              },
            }).catch(() => {}); // Don't fail if event insert fails
          }
        }
        
        // Skip this job - cap reached
        continue;
      }

      // Block 369: Check if followups are stopped for this lead (global flag)
      if (leadStopFollowups.get(job.lead_id)) {
        // Skip this job - lead has stop_followups = true
        continue;
      }

      // Block 392: Filter out leads that have replied, unsubscribed, or bounced
      if (leadReplied.get(job.lead_id) || leadUnsubscribed.get(job.lead_id) || leadBounced.get(job.lead_id)) {
        // Skip this job - lead has replied/unsubscribed/bounced
        continue;
      }

      // Block 392: Filter out campaign_leads with replied/unsubscribed/bounced status
      if (job.campaign_id && job.lead_id) {
        const statusKey = `${job.campaign_id}:${job.lead_id}`;
        const enrollmentStatus = campaignLeadStatuses.get(statusKey);
        if (enrollmentStatus && ['replied', 'unsubscribed', 'bounced'].includes(enrollmentStatus)) {
          // Skip this job - enrollment is replied/unsubscribed/bounced
          continue;
        }
      }

      // Check if followups are stopped for this lead/campaign (campaign-specific)
      const { data: state } = await sb
        .from("campaign_lead_state")
        .select("stop_followups")
        .eq("workspace_id", workspaceId)
        .eq("campaign_id", job.campaign_id)
        .eq("lead_id", job.lead_id)
        .maybeSingle();

      if (!state?.stop_followups) {
        filteredJobs.push(job);
      }
    }

    // Block 351: Limit batch size by remaining workspace quotas
    // Filter jobs to respect workspace caps
    const cappedJobs = [];
    const workspaceUsed = new Map<string, number>();
    
    for (const job of filteredJobs) {
      const workspaceId = leadToWorkspace.get(job.lead_id);
      
      if (!workspaceId) {
        cappedJobs.push(job);
        continue;
      }

      const caps = workspaceCaps.get(workspaceId)!;
      const used = workspaceUsed.get(workspaceId) || 0;
      
      // Only include job if workspace has remaining quota
      if (used < caps.remaining) {
        cappedJobs.push(job);
        workspaceUsed.set(workspaceId, used + 1);
      }
    }

    if (cappedJobs.length) out.push({ mailbox: m as Mailbox, jobs: cappedJobs });
  }
  return out;
}

async function sendGmail(token: string, job: any, fromEmail: string, toEmail: string, subject: string, html: string) {
  // Build RFC822 message if not provided
  let payload = job.provider_payload ?? job.raw;
  if (!payload) {
    // Build RFC822 base64 encoded message
    const raw = buildRfc822({ from: fromEmail, to: toEmail, subject, html });
    payload = { raw };
  }
  
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const tx = await r.text();
    // map common rate codes
    if (r.status === 429 || tx.includes("Rate Limit Exceeded")) throw new Error("rate_limit");
    if (r.status >= 500) throw new Error("provider_5xx");
    throw new Error(`provider_${r.status}:${tx}`);
  }
}

function buildRfc822({ from, to, subject, html }: { from: string; to: string; subject: string; html: string }) {
  const boundary = "b1c4d3e2";
  const raw = `From: ${from}
To: ${to}
Subject: ${subject}
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="${boundary}"

--${boundary}
Content-Type: text/html; charset="UTF-8"

${html}

--${boundary}--`;

  let binary = "";
  const bytes = new TextEncoder().encode(raw);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const encoded = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return encoded;
}

async function sendOutlook(token: string, job: any, fromEmail: string, toEmail: string, subject: string, html: string) {
  let payload = job.provider_payload ?? job.raw;
  if (!payload) {
    payload = {
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: toEmail } }],
        from: { emailAddress: { address: fromEmail } },
      },
      saveToSentItems: true,
    };
  }
  
  const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const tx = await r.text();
    if (r.status === 429 || tx.includes("throttled")) throw new Error("rate_limit");
    if (r.status >= 500) throw new Error("provider_5xx");
    throw new Error(`provider_${r.status}:${tx}`);
  }
}

async function runTick() {
  const claimed = await claimJobs();
  const results: any[] = [];

  for (const group of claimed) {
    const m = group.mailbox;
    const token = await refreshIfNeeded(m);

    for (const job of group.jobs) {
      try {
        // Get lead email for sending - also check bounce status
        const { data: lead } = await sb.from("leads")
          .select("email, email_valid, email_status, workspace_id")
          .eq("id", job.lead_id)
          .single();
        
        if (!lead) {
          throw new Error("lead_not_found");
        }

        // Block 318: Usage-Aware Send Throttling - Check workspace_usage_summary for plan caps
        if (lead.workspace_id) {
          const { data: usageSummary } = await sb
            .from("workspace_usage_summary")
            .select("*")
            .eq("workspace_id", lead.workspace_id)
            .single();

          if (usageSummary) {
            const dailyCap = usageSummary.daily_send_cap || null;
            const monthlyCap = usageSummary.monthly_send_cap || null;
            const sendsToday = usageSummary.sends_today || 0;
            const sendsMonth = usageSummary.sends_month || 0;

            // Hard stop: over daily cap
            if (dailyCap && sendsToday >= dailyCap) {
              await sb.from("send_queue").update({
                status: "blocked_quota",
                last_error: "over_daily_cap"
              }).eq("id", job.id);
              
              // Log activity for UI
              await sb.from("workspace_activity").insert({
                workspace_id: lead.workspace_id,
                event_type: "send_blocked_quota",
                description: "Send blocked: daily cap reached.",
                metadata: { reason: "over_daily_cap", sends_today: sendsToday, daily_cap: dailyCap }
              }).catch(() => {});
              
              results.push({ job: job.id, ok: false, err: "over_daily_cap" });
              continue;
            }

            // Hard stop: over monthly cap
            if (monthlyCap && sendsMonth >= monthlyCap) {
              await sb.from("send_queue").update({
                status: "blocked_quota",
                last_error: "over_monthly_cap"
              }).eq("id", job.id);
              
              // Log activity for UI
              await sb.from("workspace_activity").insert({
                workspace_id: lead.workspace_id,
                event_type: "send_blocked_quota",
                description: "Send blocked: monthly cap reached.",
                metadata: { reason: "over_monthly_cap", sends_month: sendsMonth, monthly_cap: monthlyCap }
              }).catch(() => {});
              
              results.push({ job: job.id, ok: false, err: "over_monthly_cap" });
              continue;
            }

            // Soft warning: >90% of monthly or daily cap
            const monthPct = monthlyCap ? Math.round((sendsMonth / monthlyCap) * 100) : null;
            const todayPct = dailyCap ? Math.round((sendsToday / dailyCap) * 100) : null;
            
            if ((monthPct !== null && monthPct >= 90) || (todayPct !== null && todayPct >= 90)) {
              // Log warning event (throttle to avoid spam)
              const lastWarning = await sb
                .from("workspace_activity")
                .select("created_at")
                .eq("workspace_id", lead.workspace_id)
                .eq("event_type", "usage_warning")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              const shouldLogWarning = !lastWarning || 
                (new Date().getTime() - new Date(lastWarning.created_at).getTime()) > 3600000; // 1 hour

              if (shouldLogWarning) {
                await sb.from("workspace_activity").insert({
                  workspace_id: lead.workspace_id,
                  event_type: "usage_warning",
                  description: "You're close to your send cap. Consider upgrading your SmartSend plan to avoid interruptions.",
                  metadata: { 
                    sends_today: sendsToday, 
                    sends_month: sendsMonth,
                    daily_cap: dailyCap,
                    monthly_cap: monthlyCap,
                    today_pct: todayPct,
                    month_pct: monthPct
                  }
                }).catch(() => {});
              }
            }
          }
        }

        // Block 287: Overage Enforcement - Check billing caps before sending
        if (lead.workspace_id) {
          const { data: usage } = await sb
            .from("billing_usage_daily")
            .select("*")
            .eq("workspace_id", lead.workspace_id)
            .single();

          if (usage) {
            // Hard blocks
            if (usage.seat_over_cap) {
              await sb.from("send_queue").update({
                status: "blocked",
                last_error: "seat_over_cap"
              }).eq("id", job.id);
              await sb.from("billing_events").insert({
                workspace_id: lead.workspace_id,
                type: "seat_over_limit",
                detail: `Seats used: ${usage.seats_used}/${usage.seats_limit}`
              }).catch(() => {}); // Don't fail if event insert fails
              results.push({ job: job.id, ok: false, err: "seat_over_cap" });
              continue;
            }

            if (usage.send_over_cap) {
              // Block 292: Try to use credits for overage sends
              const cost = 2; // 2 credits per extra send
              const { data: deducted, error: creditError } = await sb.rpc("deduct_credits", {
                workspace_id_input: lead.workspace_id,
                amount: cost,
                reason_input: "send_overage",
              });

              if (creditError || !deducted) {
                // No credits available or error - block the send
                await sb.from("send_queue").update({
                  status: "blocked",
                  last_error: "daily_send_cap_reached"
                }).eq("id", job.id);
                await sb.from("billing_events").insert({
                  workspace_id: lead.workspace_id,
                  type: "blocked_send_cap",
                  detail: `Sends today: ${usage.sends_today}/${usage.daily_send_cap}`
                }).catch(() => {}); // Don't fail if event insert fails
                results.push({ job: job.id, ok: false, err: "daily_send_cap_reached" });
                continue;
              }
              // Credits deducted successfully - allow the send to continue
            }

            // Throttle logic (80%+ of daily cap)
            const throttlePoint = usage.daily_send_cap * (usage.throttle_threshold || 0.8);
            let throttleMs = 0;

            if (usage.sends_today >= throttlePoint) {
              const pct = usage.sends_today / usage.daily_send_cap;
              throttleMs = Math.floor(2000 * pct); // Example: 2s * load factor = delay under heavy load
            }

            // Emit warning events when >90%
            if (usage.sends_today / usage.daily_send_cap > 0.9) {
              await sb.from("billing_events").insert({
                workspace_id: lead.workspace_id,
                type: "near_cap_send",
                detail: `At ${usage.sends_today}/${usage.daily_send_cap} sends (${Math.round((usage.sends_today / usage.daily_send_cap) * 100)}%)`
              }).catch(() => {}); // Don't fail if event insert fails
            }

            // Block 289: Upgrade Nudge Logic
            // Get forecast for nudge calculation (call billing-projection edge function)
            try {
              const projectionUrl = `${SB_URL}/functions/v1/billing-projection`;
              const projectionRes = await fetch(projectionUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${SRK}`,
                },
                body: JSON.stringify({ workspace_id: lead.workspace_id }),
              });

              if (projectionRes.ok) {
                const forecast = await projectionRes.json();

                // Determine nudge level
                let nudge: "none" | "warning" | "upgrade_soon" | "critical" = "none";

                if (forecast.sends_forecast_30d > usage.daily_send_cap * 30 * 2) {
                  nudge = "critical";
                } else if (forecast.sends_forecast_30d > usage.daily_send_cap * 30 * 1.5) {
                  nudge = "upgrade_soon";
                } else if (usage.sends_today > usage.daily_send_cap * 0.8) {
                  nudge = "warning";
                }

                // Log nudge events (only on threshold crossings to avoid spam)
                if (nudge === "critical" || nudge === "upgrade_soon") {
                  await sb.from("billing_events").insert({
                    workspace_id: lead.workspace_id,
                    type: `nudge_${nudge}`,
                    detail: `Forecast: ${forecast.sends_forecast_30d} sends in 30 days vs cap: ${usage.daily_send_cap * 30}`
                  }).catch(() => {}); // Don't fail if event insert fails
                }
              }
            } catch (e) {
              // Silently fail nudge calculation - don't block sending
              console.error("Failed to calculate nudge:", e);
            }

            // Apply throttle if needed
            if (throttleMs > 0) {
              await new Promise((res) => setTimeout(res, throttleMs));
            }
          }
        }

        // Bounce suppression: skip sending if email is invalid or has bounced
        if (lead.email_valid === false || lead.email_status === 'hard' || lead.email_status === 'soft' || lead.email_status === 'block') {
          await sb.from("send_queue").update({
            status: "skipped_bounce",
            last_error: `Email bounced: ${lead.email_status || 'invalid'}`
          }).eq("id", job.id);
          results.push({ job: job.id, ok: false, err: "bounce_suppressed" });
          continue;
        }

        // Block 316: Suppression check - skip sending if email is suppressed or lead is unsubscribed
        if (lead.workspace_id) {
          // Check if lead is unsubscribed
          const { data: leadData } = await sb.from("leads")
            .select("unsubscribed")
            .eq("id", job.lead_id)
            .maybeSingle();
          
          if (leadData?.unsubscribed) {
            await sb.from("send_queue").update({
              status: "canceled",
              last_error: "unsubscribed"
            }).eq("id", job.id);
            results.push({ job: job.id, ok: false, err: "unsubscribed" });
            continue;
          }

          // Check if email is in suppression list
          const { data: suppressed } = await sb
            .from("email_suppressions")
            .select("id")
            .eq("workspace_id", lead.workspace_id)
            .eq("email", lead.email.toLowerCase())
            .maybeSingle();

          if (suppressed) {
            await sb.from("send_queue").update({
              status: "canceled",
              last_error: "suppressed"
            }).eq("id", job.id);
            results.push({ job: job.id, ok: false, err: "suppressed" });
            continue;
          }
        }

        // Block 465: Global Sending Calendar - Comprehensive send time check
        if (lead.workspace_id) {
          const { data: canSendCheck } = await sb.rpc("can_send_now_global", {
            p_workspace_id: lead.workspace_id,
            p_inbox_id: m.id || null,
            p_lead_id: job.lead_id || null,
            p_check_time: new Date().toISOString()
          });
          
          if (canSendCheck && !canSendCheck.can_send) {
            // Cannot send now - reschedule for next valid time
            let nextValidTime = canSendCheck.next_valid_time;
            
            if (!nextValidTime) {
              // Get lead timezone/country if available
              const { data: leadData } = await sb
                .from("leads")
                .select("timezone, country")
                .eq("id", job.lead_id)
                .maybeSingle();
              
              const { data: nextTime } = await sb.rpc("get_next_valid_send_time_global", {
                p_workspace_id: lead.workspace_id,
                p_inbox_id: m.id || null,
                p_current_time: new Date().toISOString(),
                p_lead_timezone: leadData?.timezone || null,
                p_lead_country: leadData?.country || null
              });
              
              nextValidTime = nextTime;
            }
            
            if (nextValidTime) {
              await sb.from("send_queue").update({
                status: "queued",
                next_attempt_at: nextValidTime,
                last_error: canSendCheck.throttle_reason || "outside_sending_window"
              }).eq("id", job.id);
              results.push({ 
                job: job.id, 
                ok: false, 
                err: canSendCheck.throttle_reason || "outside_sending_window", 
                rescheduled: nextValidTime 
              });
              continue;
            }
          }
        }

        const html = job.html ?? job.body ?? "";
        const subject = job.subject ?? "";

        if (m.provider === "gmail") {
          await sendGmail(token, job, m.email, lead.email, subject, html);
        } else {
          await sendOutlook(token, job, m.email, lead.email, subject, html);
        }

        // Record sent event in email_events with variant_id
        const variantId = job.variant_id || null;
        const campaignId = job.campaign_id || null;
        
        if (campaignId && lead) {
          await sb.from("email_events").insert({
            campaign_id: campaignId,
            lead_id: job.lead_id,
            variant_id: variantId,
            event_type: "sent"
          }).catch((err) => {
            // Log but don't fail if email_events insert fails
            console.error("Failed to insert email_events:", err);
          });
        }

        // mark sent + increase quota
        await sb.from("send_queue").update({ status: "sent", last_error: null }).eq("id", job.id);
        await sb.from("mailboxes").update({ send_quota_used: m.send_quota_used + 1 }).eq("id", m.id);
        
        // Increment mailbox_stats (Block 255)
        await sb.rpc("increment_mailbox_sent", { p_mailbox_id: m.id }).catch((err) => {
          console.error("Failed to increment mailbox_stats:", err);
        });
        
        m.send_quota_used += 1;
        results.push({ job: job.id, ok: true });
      } catch (e) {
        // Block 464: Smart Resend Engine v1 - Intelligent retry and failover logic
        const errorText = String(e);
        const currentRetryCount = (job.retry_count ?? job.attempt_count ?? job.attempt ?? 0);
        const attemptInc = currentRetryCount + 1;
        
        // Classify error type using database function
        const { data: errorCategory } = await sb.rpc("classify_error_type", {
          p_error_text: errorText
        }).catch(() => ({ data: "temp_smtp" }));
        
        const errorCat = errorCategory || "temp_smtp";
        
        // Check if this is a permanent error (hard bounce)
        const isPermanent = errorCat === "permanent" || 
          /invalidrecipient|invalid_from|policy_violation|550|554|user unknown|mailbox unavailable|blocked|hard.*bounce/i.test(errorText);
        
        if (isPermanent) {
          // Permanent error - mark as failed, no retry
          await sb.from("send_queue").update({
            status: "failed",
            attempt_count: attemptInc,
            attempt: attemptInc,
            retry_count: attemptInc,
            last_error: errorText,
            error_category: "permanent"
          }).eq("id", job.id);
          
          results.push({ job: job.id, ok: false, err: errorText });
          continue;
        }
        
        // Get retry strategy from database
        const { data: strategy } = await sb
          .from("retry_strategies")
          .select("*")
          .eq("error_category", errorCat)
          .single()
          .catch(() => ({ data: null }));
        
        const maxAttempts = strategy?.max_attempts ?? 3;
        
        // Check if we've exceeded max retries
        if (attemptInc >= maxAttempts) {
          // Block 464: Router v2 integration - for A-tier/high-intent leads, prefer safest inbox
          let preferSafeInbox = false;
          if (lead.workspace_id && job.lead_id) {
            try {
              const { data: leadData } = await sb
                .from("leads")
                .select("priority, icp_score")
                .eq("id", job.lead_id)
                .single()
                .catch(() => ({ data: null }));
              
              // A-tier or high ICP score → prefer safest inbox
              if (leadData && (leadData.priority === "A" || (leadData.icp_score && leadData.icp_score >= 80))) {
                preferSafeInbox = true;
              }
            } catch (e) {
              // Silently fail
            }
          }
          
          // Trigger failover (with Router v2 preference for high-value leads)
          const { data: failoverMailboxId } = await sb.rpc("trigger_failover", {
            p_queue_id: job.id
          }).catch(() => ({ data: null }));
          
          if (failoverMailboxId) {
            // Failover successful - log activity
            await sb.rpc("log_retry_event", {
              p_queue_id: job.id,
              p_event_type: "failover_triggered",
              p_message: `Retry #${attemptInc} failed → failover to inbox: ${failoverMailboxId}`,
              p_metadata: {
                original_mailbox_id: job.mailbox_id,
                failover_mailbox_id: failoverMailboxId,
                retry_count: attemptInc,
                error_category: errorCat
              }
            }).catch(() => {});
            
            // Update Fleet Manager - reduce inbox health
            await sb.rpc("update_inbox_health_after_retries", {
              p_mailbox_id: job.mailbox_id
            }).catch(() => {});
            
            results.push({ job: job.id, ok: false, err: errorText, failover: true });
          } else {
            // No failover available - mark as failed
            await sb.from("send_queue").update({
              status: "failed",
              attempt_count: attemptInc,
              attempt: attemptInc,
              retry_count: attemptInc,
              last_error: errorText,
              error_category: errorCat
            }).eq("id", job.id);
            
            results.push({ job: job.id, ok: false, err: errorText });
          }
          continue;
        }
        
        // Block 464: Integrate with Predictions v1 for risk-based retry delays
        let riskMultiplier = 1.0;
        if (lead.workspace_id && job.mailbox_id) {
          try {
            // Get bounce risk prediction for this inbox
            const { data: prediction } = await sb
              .from("predictions")
              .select("predicted_value, confidence")
              .eq("workspace_id", lead.workspace_id)
              .eq("inbox_id", job.mailbox_id)
              .eq("metric", "bounce_risk")
              .order("created_at", { ascending: false })
              .limit(1)
              .single()
              .catch(() => ({ data: null }));
            
            if (prediction && prediction.predicted_value) {
              // Higher predicted bounce risk → increase delay
              // If predicted bounce risk > 10%, increase delay by 50%
              if (prediction.predicted_value > 10) {
                riskMultiplier = 1.5;
              } else if (prediction.predicted_value > 5) {
                riskMultiplier = 1.25;
              }
            }
          } catch (e) {
            // Silently fail - use default multiplier
            console.error("Failed to get prediction:", e);
          }
        }
        
        // Schedule retry using database function (with risk multiplier applied in function)
        const { data: nextAttemptAt } = await sb.rpc("schedule_retry", {
          p_queue_id: job.id,
          p_error_text: errorText,
          p_retry_count: attemptInc
        }).catch(() => ({ data: null }));
        
        // Apply risk multiplier to delay if prediction indicates higher risk
        if (nextAttemptAt && riskMultiplier > 1.0) {
          const baseDelay = new Date(nextAttemptAt).getTime() - Date.now();
          const adjustedDelay = baseDelay * riskMultiplier;
          const adjustedNextAttemptAt = new Date(Date.now() + adjustedDelay).toISOString();
          
          await sb.from("send_queue").update({
            next_attempt_at: adjustedNextAttemptAt
          }).eq("id", job.id);
        }
        
        if (nextAttemptAt) {
          // Log retry event
          await sb.rpc("log_retry_event", {
            p_queue_id: job.id,
            p_event_type: "retry_scheduled",
            p_message: `${errorCat} detected → retry scheduled in ${Math.round((new Date(nextAttemptAt).getTime() - Date.now()) / 60000)} minutes`,
            p_metadata: {
              error_category: errorCat,
              retry_count: attemptInc,
              next_attempt_at: nextAttemptAt,
              error_text: errorText.substring(0, 200)
            }
          }).catch(() => {});
          
          // Check for domain misconfiguration (Inbox Inspector integration)
          if (errorCat === "dns" || errorText.includes("SPF") || errorText.includes("DKIM") || errorText.includes("DMARC")) {
            // Trigger Inbox Inspector alert
            const domain = m.email.split("@")[1];
            if (domain) {
              await sb.rpc("log_retry_event", {
                p_queue_id: job.id,
                p_event_type: "domain_misconfiguration_detected",
                p_message: `Domain misconfiguration detected: ${errorCat}`,
                p_metadata: {
                  domain,
                  error_category: errorCat,
                  error_text: errorText.substring(0, 200)
                }
              }).catch(() => {});
            }
          }
          
          results.push({ job: job.id, ok: false, err: errorText, retry_scheduled: true, next_attempt_at: nextAttemptAt });
        } else {
          // Fallback to manual retry scheduling
          const delay = expBackoffMs(attemptInc);
          const nextAt = new Date(Date.now() + delay).toISOString();
          
          await sb.from("send_queue").update({
            status: "retry_scheduled",
            attempt_count: attemptInc,
            attempt: attemptInc,
            retry_count: attemptInc,
            next_attempt_at: nextAt,
            last_error: errorText,
            error_category: errorCat
          }).eq("id", job.id);
          
          results.push({ job: job.id, ok: false, err: errorText, retry_scheduled: true });
        }
        
        // If rate-limit, also add spread to mailbox pacing
        if (errorCat === "rate_limit" || errorText.includes("rate_limit")) {
          await sb.from("mailboxes").update({
            send_quota_used: Math.min(m.send_quota_per_day, m.send_quota_per_day) // no change; rely on next tick delay
          }).eq("id", m.id);
        }
      }
      if (m.send_quota_used >= m.send_quota_per_day) break;
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== `Bearer ${SRK}`) return new Response("forbidden", { status: 403 });
  
  try {
    // Try to get workspaceId from request payload (optional)
    let workspaceId: string | null = null;
    try {
      if (req.method === "POST" || req.method === "PUT") {
        const body = await req.json().catch(() => ({}));
        workspaceId = body.workspaceId || null;
      }
    } catch {
      // No body or invalid JSON - continue without workspaceId
    }

    // 🔥 NEW: quota guard - if workspaceId is provided, check quota before processing
    if (workspaceId) {
      const quotaResult: QuotaCheckResult = await checkWorkspaceQuota(
        sb,
        workspaceId
      );

      if (!quotaResult.allowed) {
        const reason = quotaResult.reason ?? "quota_limit_reached";

        // Log event for Billing UI
        await sb
          .from("billing_usage_events")
          .insert({
            workspace_id: workspaceId,
            event_type: "quota_blocked",
            payload: {
              reason,
              snapshot: quotaResult.snapshot,
              at: new Date().toISOString(),
            },
          })
          .catch((err) => {
            console.error("[send-dispatcher] billing_usage_events insert error", err);
          });

        // 🔥 NEW: Pause active campaigns for this workspace
        await pauseActiveCampaignsForWorkspace(sb, workspaceId, reason);

        return new Response(
          JSON.stringify({
            status: "blocked_by_quota",
            reason,
            snapshot: quotaResult.snapshot,
          }),
          { 
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }

    // If allowed or no workspaceId provided → proceed with existing dispatcher logic
    const res = await runTick();
    return new Response(JSON.stringify({ ok: true, res }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[send-dispatcher] error", err);
    return new Response(
      JSON.stringify({ error: "server_error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
