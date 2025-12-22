// supabase/functions/sender-tick/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { makeTrackingToken, injectPixelAndRewrite } from "../_lib/tracking.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_PUBLIC_URL") || Deno.env.get("SUPABASE_URL")!.replace(/\/\/[^/]+/, "//functions/v1");
const TRACKING_SECRET = Deno.env.get("TRACKING_SECRET")!;

type QueueRow = {
  id: string;
  campaign_id: string;
  lead_id: string;
  mailbox_id: string;
  account_id?: string;
  scheduled_at: string;
  subject?: string;
  body_html?: string;
  to_email?: string;
  step_no?: number;
  thread_id?: string;
  idempotency_key?: string | null;
};

async function inWindow(supabase: any, mailboxId: string, nowUtc: Date): Promise<boolean> {
  const { data: m } = await supabase
    .from("connected_accounts")
    .select("tz, send_start, send_end")
    .eq("id", mailboxId)
    .single();

  if (!m || !m.send_start || !m.send_end) return true;
  const tz = m.tz || "UTC";

  // compute local time components
  // Deno doesn't have luxon by default; do a quick fetch via SQL helper
  const { data: nextTs } = await supabase.rpc("next_in_window", { 
    p_mailbox: mailboxId, 
    p_from: nowUtc.toISOString() 
  });
  
  // If "next_in_window" returns now or earlier, we're inside window; else the next allowed is in future.
  return nextTs && new Date(nextTs) <= nowUtc;
}

async function incrementCounter(supabase: any, mailboxId: string) {
  // call reset and then increment atomically-ish
  await supabase.rpc("reset_mailbox_counter_if_new_day", { p_mailbox: mailboxId });
  
  // increment
  const { data: current } = await supabase
    .from("connected_accounts")
    .select("daily_sent_count")
    .eq("id", mailboxId)
    .single();
  
  const newCount = (current?.daily_sent_count ?? 0) + 1;
  
  await supabase
    .from("connected_accounts")
    .update({ daily_sent_count: newCount })
    .eq("id", mailboxId);
}

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const now = new Date();

  // Touch heartbeat at the start
  await supabase.from("cron_heartbeats")
    .upsert({ key: "sender-tick", last_seen: new Date().toISOString() }, { onConflict: "key" });

  // 1) Pull a small batch of due items
  const { data: due } = await supabase
    .from("send_queue")
    .select("id, campaign_id, lead_id, mailbox_id, account_id, scheduled_at, subject, body_html, to_email, step_no, thread_id, idempotency_key")
    .eq("status", "pending")
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), { 
      headers: { "Content-Type": "application/json" } 
    });
  }

  let sent = 0;

  // 2) Mark as 'sending' optimistically (best-effort)
  await supabase
    .from("send_queue")
    .update({ status: "sending" })
    .in("id", due.map((d: QueueRow) => d.id));

  for (const q of due as QueueRow[]) {
    try {
      // Guard sends with ACL: check if campaign has valid owner/editor
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("user_id")
        .eq("id", q.campaign_id)
        .maybeSingle();
      
      if (campaign?.user_id) {
        // Check if there's at least one owner or editor for this campaign
        const { data: members } = await supabase
          .from("campaign_members")
          .select("role")
          .eq("campaign_id", q.campaign_id)
          .in("role", ["owner", "editor"])
          .limit(1);
        
        if (!members || members.length === 0) {
          // No owner/editor found, mark as failed
          await supabase.rpc("complete_queue_item", {
            p_queue: q.id,
            p_campaign: q.campaign_id,
            p_success: false,
            p_message_id: null,
            p_thread_id: null,
            p_error: "no_permission"
          });
          continue;
        }
      }

      // Block suppressed recipients
      // Get email from queue row or fetch from leads table
      let recipientEmail = q.to_email?.toLowerCase();
      if (!recipientEmail && q.lead_id) {
        const { data: lead } = await supabase
          .from("leads")
          .select("email")
          .eq("id", q.lead_id)
          .maybeSingle();
        recipientEmail = lead?.email?.toLowerCase();
      }

      if (recipientEmail) {
        const [{ data: sup }, { data: csup }] = await Promise.all([
          supabase
            .from("suppressions")
            .select("id")
            .eq("email", recipientEmail)
            .limit(1),
          supabase
            .from("campaign_suppressions")
            .select("id")
            .eq("campaign_id", q.campaign_id)
            .eq("email", recipientEmail)
            .limit(1)
        ]);

        if ((sup && sup.length > 0) || (csup && csup.length > 0)) {
          // mark queue as skipped and continue
          await supabase.rpc("complete_queue_item", {
            p_queue: q.id,
            p_campaign: q.campaign_id,
            p_success: false,
            p_message_id: null,
            p_thread_id: null,
            p_error: "suppressed"
          });
          continue;
        }
      }

      // Safety: if account_id missing, resolve from mailbox_id/campaign mapping
      let accountId = q.account_id;
      if (!accountId) {
        // Try to get account_id from mailbox_id (legacy support)
        if (q.mailbox_id) {
          accountId = q.mailbox_id;
          // Update the queue row with account_id for future runs
          await supabase
            .from("send_queue")
            .update({ account_id: q.mailbox_id })
            .eq("id", q.id);
        } else {
          // If no account_id or mailbox_id, skip (shouldn't happen)
          console.error(`Queue item ${q.id} has no account_id or mailbox_id`);
          continue;
        }
      }

      // Fetch today's warmup cap
      const { data: capRes } = await supabase.rpc("account_today_cap", { p_account: accountId }).single();
      const todayCap = typeof capRes === "number" ? capRes : 40;

      // Count how many sent today
      const { data: usedRes } = await supabase
        .from("v_mailbox_usage_today")
        .select("sent_count")
        .eq("account_id", accountId)
        .maybeSingle();

      const used = usedRes?.sent_count ?? 0;

      // Compare against warmup cap (not hard daily_cap)
      if (used >= todayCap) {
        const { data: nextAt } = await supabase.rpc("defer_to_tomorrow_morning", { p_queue: q.id }).single().catch(() => ({ data: null }));
        await supabase.from("audit_logs").insert({
          campaign_id: q.campaign_id,
          thread_id: q.thread_id ?? null,
          action: "auto.defer_daily_cap",
          meta: { reason: "warmup_cap", cap: todayCap, used, next_at: nextAt }
        });
        continue;
      }

      // Check if thread has replied (defense-in-depth guard)
      // Uses the new (campaign_id, lead_id) unique index → O(1) lookup
      const { data: thr, error: thrErr } = await supabase
        .from("inbox_threads")
        .select("id, replied_at, stopped_by_reply, campaign_id")
        .eq("campaign_id", q.campaign_id)
        .eq("lead_id", q.lead_id)
        .limit(1)
        .maybeSingle();

      if (thr?.replied_at) {
        // Defensive cancel - thread was replied to
        await supabase
          .from("send_queue")
          .update({
            status: "canceled",
            error: "auto-cancel: replied thread"
          })
          .eq("id", q.id);
        continue;
      }

      // Check window
      if (!(await inWindow(supabase, q.mailbox_id, now))) {
        // Move to next allowed time
        const { data: nextTs } = await supabase.rpc("next_in_window", { 
          p_mailbox: q.mailbox_id, 
          p_from: now.toISOString() 
        });
        
        await supabase
          .from("send_queue")
          .update({
            status: "pending",
            scheduled_at: nextTs || new Date(now.getTime() + 36e5).toISOString()
          })
          .eq("id", q.id);
        continue;
      }

      // Check if campaign is paused by guard
      const { data: campGuard } = await supabase
        .from("campaigns")
        .select("paused_by_guard")
        .eq("id", q.campaign_id)
        .maybeSingle();

      if (campGuard?.paused_by_guard) {
        // Cancel this queue item due to guard pause
        await supabase
          .from("send_queue")
          .update({
            status: "canceled",
            error: "paused_by_guard"
          })
          .eq("id", q.id);
        continue;
      }

      // 1) Respect campaign toggle
      const { data: camp } = await supabase
        .from("campaigns")
        .select("respect_suppression")
        .eq("id", q.campaign_id)
        .single();

      if (camp?.respect_suppression !== false) {
        // 2) Fetch recipient email (from leads)
        const { data: lead } = await supabase
          .from("leads")
          .select("email")
          .eq("id", q.lead_id)
          .single();

        const rcpt = lead?.email?.toLowerCase();
        if (rcpt) {
          const { data: sup } = await supabase
            .from("suppressed_recipients")
            .select("email, reason")
            .eq("email", rcpt)
            .maybeSingle();

          if (sup?.email) {
            await supabase
              .from("send_queue")
              .update({ status: "canceled", error: `suppressed: ${sup.reason}` })
              .eq("id", q.id);
            // skip this row
            continue;
          }
        }
      }

      // 3) Load content to send using step-aware composer
      const stepNo = q.step_no ?? 1;
      const stepNumber = (q as any).step_number ?? stepNo;
      let subject = q.subject || "No subject";
      let body = q.body_html || "";
      let to = q.to_email || "";
      
      // Block 186: Handle auto follow-ups (step_number 999)
      if (stepNumber === 999) {
        // Auto follow-up - use payload directly
        const payload = (q as any).payload;
        if (payload && typeof payload === 'object') {
          subject = payload.subject || subject;
          body = payload.body || body;
          
          // Update queue row with payload content
          await supabase.from("send_queue").update({
            subject: subject,
            body_html: body,
          }).eq("id", q.id);
        }
      } else {
        // Regular step - use compose_email_by_step
        const { data: comp, error: cerr } = await supabase.rpc("compose_email_by_step", {
          p_campaign: q.campaign_id, 
          p_lead: q.lead_id, 
          p_step: stepNo
        });
        
        if (!cerr && comp && comp.length > 0) {
          const composed = comp[0];
          subject = composed.subject || subject;
          body = composed.html || body;
          to = composed.to_email || to;
          
          // Update queue row with composed content (for reference)
          await supabase.from("send_queue").update({
            subject: subject,
            body_html: body,
            to_email: to
          }).eq("id", q.id);
        }
      }

      if (!to) {
        // Skip if no recipient
        await supabase.from("send_queue").update({
          status: "failed",
          attempt: (q as any).attempt + 1,
          error: "No recipient email"
        }).eq("id", q.id);
        continue;
      }

      // Guard: Check for duplicate step within window (before sending)
      const WINDOW_HOURS = 24; // adjust if you want
      const { data: dup } = await supabase.rpc('was_step_sent_recently', {
        p_campaign: q.campaign_id,
        p_lead: q.lead_id,
        p_step: stepNo,
        p_window: `${WINDOW_HOURS} hours`
      }).single();

      if (dup === true) {
        await supabase
          .from('send_queue')
          .update({ status: 'canceled', error: `duplicate: step within ${WINDOW_HOURS}h` })
          .eq('id', q.id);

        await supabase.from('audit_logs').insert({
          campaign_id: q.campaign_id,
          thread_id: q.thread_id ?? null,
          action: 'auto.cancel_followups',
          meta: { canceled: 1, reason: 'duplicate', step_no: stepNo, window_h: WINDOW_HOURS }
        });

        continue; // skip send
      }

      // 4) Fetch account and send using provider router
      let provider = "unknown";
      let ok = false;
      let providerMessageId: string | null = null;
      let logId: string | null = null;
      
      try {
        // Fetch account (server-side; use service key in server runtime)
        const { data: acct, error: acctErr } = await supabase
          .from("connected_accounts")
          .select("id, provider, smtp_settings")
          .eq("id", accountId)
          .maybeSingle();

        if (acctErr || !acct) {
          // mark failed quickly
          await supabase.from("send_queue").update({
            status: "canceled",
            error: `no_account:${acctErr?.message ?? "missing"}`
          }).eq("id", q.id);
          continue;
        }

        provider = acct.provider || "unknown";

        // Create send_logs entry with status 'sending' first
        const { data: logData, error: logErr } = await supabase
          .from("send_logs")
          .insert({
            queue_id: q.id,
            mailbox_id: q.mailbox_id,
            campaign_id: q.campaign_id,
            lead_id: q.lead_id,
            provider: provider,
            status: "sending",
            step_no: stepNo ?? (q.step_no ?? 1),
            to_email: to,
            subject: subject
          })
          .select("id")
          .single();
        
        if (logErr) {
          console.error("Failed to create send_log:", logErr);
        } else {
          logId = logData?.id || null;
        }

        // Generate tracking token and enrich HTML
        let trackedHtml = body;
        let trackingToken: string | null = null;
        if (logId && TRACKING_SECRET) {
          try {
            trackingToken = crypto.randomUUID();
            const token = await makeTrackingToken({
              tracking_token: trackingToken,
              campaign_id: q.campaign_id,
              account_id: accountId,
              send_log_id: logId,
              lead_id: q.lead_id
            }, TRACKING_SECRET);
            trackedHtml = injectPixelAndRewrite(body, token, APP_URL);
          } catch (trackErr) {
            console.error("Tracking token generation failed:", trackErr);
            // Continue without tracking if token generation fails
          }
        }

        // Call provider send endpoint
        const sendEmailUrl = Deno.env.get("SEND_EMAIL_PROVIDER_URL") || 
          `${Deno.env.get("NEXT_PUBLIC_APP_URL") || "http://localhost:3000"}/api/send-email-provider`;
        
        try {
          const r = await fetch(sendEmailUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("CRON_SECRET") || Deno.env.get("SEND_DAEMON_SECRET") || ""}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              account_id: accountId,
              to,
              subject,
              text: trackedHtml.replace(/<[^>]*>/g, ""), // strip HTML for text version
              html: trackedHtml
            })
          });
          
          ok = r.ok;
          if (r.ok) {
            const result = await r.json();
            provider = result.provider || provider;
            providerMessageId = result.message_id || result.provider_message_id || null;
          } else {
            const errorData = await r.json().catch(() => ({ error: "Unknown error" }));
            throw new Error(errorData.error || `HTTP ${r.status}`);
          }
        } catch (e) {
          console.error("Send error:", e);
          ok = false;
          throw e;
        }

        if (!ok) {
          throw new Error("provider send failed");
        }

        // 5) Update queue + log (unchanged from your previous slice)
        if (ok && providerMessageId) {
          // Try to get or create thread_id if not already set
          let resolvedThreadId = q.thread_id;
          if (!resolvedThreadId && q.campaign_id && q.lead_id) {
            try {
              // Try to find existing thread first
              const { data: existingThread } = await supabase
                .from('inbox_threads')
                .select('id')
                .eq('campaign_id', q.campaign_id)
                .eq('lead_id', q.lead_id)
                .maybeSingle();
              
              if (existingThread?.id) {
                resolvedThreadId = existingThread.id;
              } else {
                // Create thread using upsert helper if available
                const { data: newThreadId } = await supabase.rpc('upsert_thread_on_message', {
                  p_campaign: q.campaign_id,
                  p_lead: q.lead_id,
                  p_subject: q.subject || null,
                  p_direction: 'out'
                }).catch(() => ({ data: null }));
                
                if (newThreadId) {
                  resolvedThreadId = newThreadId;
                }
              }
            } catch (e) {
              // Thread creation is optional, don't fail the send
              console.error('Failed to resolve thread_id:', e);
            }
          }
          
          await supabase.from('send_queue').update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            thread_id: resolvedThreadId || null,
            provider_message_id: providerMessageId || null
          }).eq('id', q.id);

          if (logId) {
            await supabase.from('send_logs').update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              provider_message_id: providerMessageId,
              provider: provider,
              tracking_token: trackingToken,
              body_html: trackedHtml,
              updated_at: new Date().toISOString(),
              idempotency_key: q.idempotency_key ?? null
            }).eq('id', logId);
          } else {
            // Fallback: insert if log creation failed
            await supabase.from('send_logs').insert({
              queue_id: q.id,
              mailbox_id: q.mailbox_id,
              campaign_id: q.campaign_id,
              lead_id: q.lead_id,
              provider,
              status: 'sent',
              provider_message_id: providerMessageId,
              tracking_token: trackingToken,
              body_html: trackedHtml,
              sent_at: new Date().toISOString(),
              step_no: stepNo ?? (q.step_no ?? 1),
              to_email: to,
              subject: subject,
              idempotency_key: q.idempotency_key ?? null
            });
          }

          if (q.idempotency_key) {
            const { error: attemptUpdateError } = await supabase
              .from('send_attempts')
              .update({
                status: 'sent',
                provider_message_id: providerMessageId
              })
              .eq('idempotency_key', q.idempotency_key);

            if (attemptUpdateError) {
              console.error('send_attempts update failed', attemptUpdateError);
            }
          }
        }

        await incrementCounter(supabase, q.mailbox_id);

        // Block 186: Intent boost after auto follow-up is sent
        if (stepNumber === 999 && ok) {
          // Get company_id from lead
          const { data: leadData } = await supabase
            .from("leads")
            .select("company_id")
            .eq("id", q.lead_id)
            .maybeSingle();

          if (leadData?.company_id) {
            await supabase.from("intent_signals").insert({
              account_id: accountId,
              company_id: leadData.company_id,
              lead_id: q.lead_id,
              signal_type: "burst_activity",
              weight: 1,
            });
          }
        }

        // Log usage to usage_ledger
        const { data: campaignData } = await supabase
          .from("campaigns")
          .select("user_id")
          .eq("id", q.campaign_id)
          .single();

        if (campaignData?.user_id) {
          await supabase.from("usage_ledger").insert({
            user_id: campaignData.user_id,
            mailbox_id: q.mailbox_id,
            campaign_id: q.campaign_id,
            queue_id: q.id
          });

          // Re-check daily plan cap (guard against external sends)
          const { data: lim } = await supabase.rpc("get_usage_limits", { p_user: campaignData.user_id });
          const limits = lim && lim.length > 0 ? lim[0] : null;
          if (limits && (limits.today_count ?? 0) >= (limits.daily_cap ?? 0)) {
            // Pause remaining pending today for this user (reschedule to next window)
            const { data: boxes } = await supabase
              .from("connected_accounts")
              .select("id")
              .eq("user_id", campaignData.user_id);

            for (const b of boxes || []) {
              const { data: nextTs } = await supabase.rpc("next_in_window", {
                p_mailbox: b.id,
                p_from: new Date(Date.now() + 12 * 36e5).toISOString()
              });
              await supabase
                .from("send_queue")
                .update({
                  scheduled_at: nextTs || new Date(Date.now() + 24 * 36e5).toISOString()
                })
                .eq("status", "pending")
                .eq("mailbox_id", b.id);
            }
          }
        }

        sent++;
      } catch (err) {
        // Ensure we never block the loop - catch all errors
        const errorMsg = `provider_fail: ${String(err)}`;
        
        try {
          await supabase.from('send_queue').update({
            status: 'canceled',
            error: errorMsg,
            updated_at: new Date().toISOString()
          }).eq('id', q.id);

          if (logId) {
            await supabase.from('send_logs').update({
              status: 'failed',
              error: errorMsg,
              updated_at: new Date().toISOString(),
              idempotency_key: q.idempotency_key ?? null
            }).eq('id', logId);
          } else {
            await supabase.from('send_logs').insert({
              queue_id: q.id,
              mailbox_id: q.mailbox_id,
              campaign_id: q.campaign_id,
              lead_id: q.lead_id,
              provider: provider || 'unknown',
              status: 'failed',
              error: errorMsg,
              idempotency_key: q.idempotency_key ?? null
            });
          }
          if (q.idempotency_key) {
            await supabase
              .from('send_attempts')
              .update({ status: 'error' })
              .eq('idempotency_key', q.idempotency_key);
          }
        } catch (updateErr) {
          console.error("Failed to update send_queue/send_logs:", updateErr);
        }

        // Continue to next item - never block the loop
        continue;
      }
  }

  return new Response(JSON.stringify({ ok: true, processed: sent }), { 
    headers: { "Content-Type": "application/json" } 
  });
});
