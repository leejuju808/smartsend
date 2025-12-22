// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { instrumentHtml } from "../_lib/tracking.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{persistSession:false} });
const APP_URL = Deno.env.get("APP_PUBLIC_URL") || Deno.env.get("SUPABASE_URL")!;

async function ensureAccessToken(account_id: string) {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-refresh`, {
    method:"POST",
    headers:{ "content-type":"application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ account_id })
  }).then(r=>r.json());
  if (!r.ok) throw new Error(r.error || "token error");
  return r.access_token as string;
}

function classifyProviderError(status: number, body: string, provider: string) {
  if (status === 401 || status === 403) return "auth_error";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "provider_5xx";
  // heuristics
  if (/quota|limit/i.test(body)) return "rate_limit";
  return "other_error";
}

async function sendViaProvider(item: any, access: string, provider: "gmail"|"outlook"): Promise<{ provider_message_id: string | null; thread_id?: string | null }> {
  const to = item.to_email;
  const subject = item.subject;
  const html = item.body_html;

  if (provider === "gmail") {
    const body = [
      `Content-Type: text/html; charset="UTF-8"`,
      `MIME-Version: 1.0`,
      `To: ${to}`,
      `Subject: ${subject}`,
      ``,
      html
    ].join("\r\n");
    const raw = btoa(unescape(encodeURIComponent(body))).replace(/\+/g,'-').replace(/\//g,'_');
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,{
      method:"POST",
      headers:{ Authorization:`Bearer ${access}`, "content-type":"application/json" },
      body: JSON.stringify({ raw })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`gmail ${res.status} ${text}`);
    const json = JSON.parse(text);
    return { 
      provider_message_id: json.id || null,
      thread_id: json.threadId || null
    };
  } else {
    const message = {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to } }]
    };
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/sendMail`, {
      method:"POST",
      headers:{ Authorization:`Bearer ${access}`, "content-type":"application/json" },
      body: JSON.stringify({ message, saveToSentItems: true })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`outlook ${res.status} ${text}`);
    // Outlook doesn't return message ID in sendMail response, would need to fetch from sent items
    // For now, return null - webhook can match by other means
    return { provider_message_id: null };
  }
}

async function renderMerge(campaign_id:string, lead_id:string, subject_template:string, body_html_template:string, step_no?: number, variant_id?: string | null) {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/render-merge`,{
    method:"POST", headers:{ "content-type":"application/json" },
    body: JSON.stringify({ 
      campaign_id, 
      lead_id, 
      subject_template, 
      html_template: body_html_template,
      step_no,
      variant_id
    })
  }).then(r=>r.json());
  if (!r.ok) throw new Error("render error");
  return r;
}

// naive PG interval parser "HH:MM:SS"
function msFromPgInterval(iv: string) {
  const m = iv.match(/(\d+):(\d+):(\d+)/);
  if (!m) return 5*60*1000;
  const h = Number(m[1]), mi = Number(m[2]), s = Number(m[3]);
  return ((h*60 + mi)*60 + s)*1000;
}

function addUnsubscribeFooter(html: string, baseUrl: string, sid: string, token: string) {
  const url = `${baseUrl}/functions/v1/unsubscribe?sid=${encodeURIComponent(sid)}&t=${encodeURIComponent(token)}`;
  const footer = `
  <div style="margin-top:24px;color:#6b7280;font-size:12px;line-height:1.5">
    If you'd rather not hear from us again, you can
    <a href="${url}" target="_blank" style="color:#6b7280;text-decoration:underline">unsubscribe</a>.
  </div>`;
  if (html.match(/<\/body>/i)) return html.replace(/<\/body>/i, `${footer}</body>`);
  return html + footer;
}

function computeGuardStatus(g: any): string {
  // Hard stop: Seat limit exceeded
  if (g.seats_over_cap) {
    return "blocked_seat_limit";
  }

  // Hard stop: Daily send cap exceeded AND no credits
  if (g.sends_over_cap && g.credits_empty) {
    return "blocked_sends_no_credits";
  }

  // Fallback mode: Daily cap exceeded but credits available
  if (g.sends_over_cap && g.credits > 0) {
    return "fallback_credit_sends";
  }

  // Soft degraded: Credits empty but plan still under limits
  if (g.credits_empty && !g.sends_over_cap) {
    return "low_credits";
  }

  // All good
  return "ok";
}

async function processAccount(account: any) {
  const limit = Math.max(1, account.send_concurrency ?? 3);

  // Optional: soft throttling by per-minute cap
  const since = new Date(Date.now()-60*1000).toISOString();
  const { count } = await sb.from("send_logs").select("*", { count: "exact", head: true })
    .eq("account_id", account.id).gte("created_at", since);
  if ((count ?? 0) >= (account.per_minute_cap ?? 60)) {
    // skip this minute; record telemetry
    await sb.from("provider_events").insert({
      account_id: account.id, provider: account.provider, kind: 'rate_limit',
      detail: { reason: 'soft_cap', per_minute_cap: account.per_minute_cap }
    });
    return { processed: 0 };
  }

  // claim
  const { data: claimed } = await sb.rpc("claim_queue_for_account", { p_account: account.id, p_limit: limit });
  const items: any[] = claimed ?? [];
  if (items.length === 0) return { processed: 0 };

  const access = await ensureAccessToken(account.id);

  let ok = 0, failed = 0, deferred = 0;

  for (const item of items) {
    try {
      // hydrate queue row (join lead + step templates)
      const { data: q } = await sb.from("send_queue")
        .select("id,campaign_id,lead_id,account_id,step_no,subject_template,body_html_template,provider,provider_thread_id,to_email,thread_id")
        .eq("id", item.id).maybeSingle();
      if (!q) throw new Error("queue item missing");

      // Check if thread has stopped_by_reply
      if (q.thread_id) {
        const { data: thread } = await sb.from("inbox_threads")
          .select("stopped_by_reply")
          .eq("id", q.thread_id)
          .maybeSingle();
        if (thread?.stopped_by_reply) {
          await sb.from("send_queue").update({ status: 'canceled', cancel_reason: 'stopped_by_reply' }).eq("id", q.id);
          deferred++;
          continue;
        }
      }

      // Get lead email if to_email is not set
      let toEmail = q.to_email;
      if (!toEmail) {
        const { data: lead } = await sb.from("leads").select("email").eq("id", q.lead_id).maybeSingle();
        if (!lead?.email) throw new Error("lead email not found");
        toEmail = lead.email;
      }

      // Resolve owner for campaign and check suppression
      const { data: camp } = await sb.from("campaigns").select("user_id,workspace_id").eq("id", q.campaign_id).maybeSingle();
      const ownerId = camp?.user_id as string | undefined;
      const workspaceId = camp?.workspace_id as string | undefined;

      // Global Usage Guard Check (Block 293)
      if (workspaceId) {
        const { data: guard } = await sb
          .from("billing_global_guard")
          .select("*")
          .eq("workspace_id", workspaceId)
          .maybeSingle();

        if (guard) {
          const guardStatus = computeGuardStatus(guard);

          // Hard stop: Seat limit exceeded
          if (guardStatus === "blocked_seat_limit") {
            await sb.from("send_queue").update({
              status: "canceled",
              cancel_reason: "blocked_seat_limit"
            }).eq("id", q.id);
            await sb.from("billing_events").insert({
              workspace_id: workspaceId,
              type: "blocked_send_seat_limit",
              detail: `Send blocked: workspace exceeded seat limit`
            });
            // Log to workspace_activity (only log once per workspace, not per send)
            await sb.from("workspace_activity").insert({
              workspace_id: workspaceId,
              actor_id: null,
              event_type: "billing_limit_hit",
              description: `Sending blocked due to seat limit`,
              campaign_id: camp?.id || null,
              metadata: { guard_status: "blocked_seat_limit" },
            }).catch(() => {}); // Ignore errors to avoid blocking sends
            
            // Create notification for workspace owner
            try {
              const { data: owner } = await sb
                .from("team_members")
                .select("user_id")
                .eq("workspace_id", workspaceId)
                .order("created_at", { ascending: true })
                .limit(1)
                .single();

              if (owner) {
                await sb.from("notifications").insert({
                  workspace_id: workspaceId,
                  user_id: owner.user_id,
                  type: "billing",
                  title: "Sending blocked due to limits",
                  body: `Reason: ${guardStatus}`,
                  data: { guard_status: guardStatus },
                });
              }
            } catch (err) {
              console.error("Failed to create billing notification:", err);
              // Don't fail the request if notification fails
            }
            
            deferred++;
            continue;
          }

          // Hard stop: Daily send cap exceeded AND no credits
          if (guardStatus === "blocked_sends_no_credits") {
            await sb.from("send_queue").update({
              status: "canceled",
              cancel_reason: "blocked_sends_no_credits"
            }).eq("id", q.id);
            await sb.from("billing_events").insert({
              workspace_id: workspaceId,
              type: "blocked_send_no_credits",
              detail: `Send blocked: daily cap exceeded and no credits`
            });
            // Log to workspace_activity (only log once per workspace, not per send)
            await sb.from("workspace_activity").insert({
              workspace_id: workspaceId,
              actor_id: null,
              event_type: "billing_limit_hit",
              description: `Sending blocked due to daily send cap exceeded and no credits`,
              campaign_id: camp?.id || null,
              metadata: { guard_status: "blocked_sends_no_credits" },
            }).catch(() => {}); // Ignore errors to avoid blocking sends
            
            // Create notification for workspace owner
            try {
              const { data: owner } = await sb
                .from("team_members")
                .select("user_id")
                .eq("workspace_id", workspaceId)
                .order("created_at", { ascending: true })
                .limit(1)
                .single();

              if (owner) {
                await sb.from("notifications").insert({
                  workspace_id: workspaceId,
                  user_id: owner.user_id,
                  type: "billing",
                  title: "Sending blocked due to limits",
                  body: `Reason: ${guardStatus}`,
                  data: { guard_status: guardStatus },
                });
              }
            } catch (err) {
              console.error("Failed to create billing notification:", err);
              // Don't fail the request if notification fails
            }
            
            deferred++;
            continue;
          }

          // Fallback mode: Daily cap exceeded but credits available - deduct credits
          if (guardStatus === "fallback_credit_sends") {
            const { data: deducted } = await sb.rpc("deduct_credits", {
              workspace_id_input: workspaceId,
              amount: 2,
              reason_input: "send_overage"
            });
            // deduct_credits returns boolean (true if successful)
            if (deducted !== true) {
              // Failed to deduct credits, block send
              await sb.from("send_queue").update({
                status: "canceled",
                cancel_reason: "credits_deduction_failed"
              }).eq("id", q.id);
              deferred++;
              continue;
            }
            // Continue with send after deducting credits
          }

          // Soft degraded: Credits empty but plan still under limits - allow but log warning
          if (guardStatus === "low_credits") {
            await sb.from("billing_events").insert({
              workspace_id: workspaceId,
              type: "low_credits_warning",
              detail: `Send allowed but workspace has low credits`
            });
            // Continue with send
          }
        }
      }

      // Get lead email/domain for suppression check
      const { data: lead } = await sb.from("leads").select("email, domain, bounced").eq("id", q.lead_id).maybeSingle();
      const email = lead?.email ?? toEmail ?? null;
      const domain = lead?.domain ?? (email ? email.split("@")[1] ?? null : null);

      // Skip if lead is bounced
      if (lead?.bounced) {
        await sb
          .from("send_queue")
          .update({ status: "skipped", skip_reason: "bounced" })
          .eq("id", q.id);
        deferred++;
        continue;
      }

      // Check suppression before sending
      if (ownerId) {
        const { data: sup } = await sb.rpc("is_suppressed", { 
          p_user: ownerId, 
          p_email: email, 
          p_domain: domain 
        });
        if (sup === true) {
          await sb.from("send_queue").update({ 
            status: "canceled", 
            canceled_reason: "suppressed" 
          }).eq("id", q.id);
          deferred++;
          continue;
        }
      }

      // Soft-bounce throttle: check recent soft bounces (≥2 in 30d)
      const { data: softCountView } = await sb
        .from("v_soft_bounce_counts")
        .select("soft_bounces_30d")
        .eq("lead_id", q.lead_id)
        .maybeSingle();

      const softCount = softCountView?.soft_bounces_30d ?? 0;
      if (softCount >= 2) {
        await sb.from("send_queue").update({
          status: "canceled",
          canceled_reason: "soft_bounce_throttle"
        }).eq("id", q.id);
        deferred++;
        continue;
      }

      // Pick variant if step_no provided
      let variantId: string | null = null;
      if (q.step_no) {
        const { data: picked, error: pickErr } = await sb.rpc("pick_variant_for_lead", {
          p_campaign: q.campaign_id,
          p_step: q.step_no,
          p_lead: q.lead_id
        });
        if (pickErr) throw pickErr;
        variantId = (picked as any) ?? null;
      }

      // render with step_no + variant_id so render-merge uses variant templates
      const renderRes = await renderMerge(q.campaign_id, q.lead_id, q.subject_template, q.body_html_template, q.step_no, variantId);
      if (!renderRes.ok) throw new Error(renderRes.error || "render-merge failed");
      const { subject, html, variant_id: resolvedVariantId } = renderRes;
      variantId = resolvedVariantId ?? variantId;

      // Generate unsubscribe token
      const unsubToken = crypto.randomUUID();

      // 1) Insert a placeholder send_log row to get id with unsubscribe_token
      const { data: pre, error: preErr } = await sb.from("send_logs")
        .insert({
          queue_id: q.id,
          campaign_id: q.campaign_id,
          account_id: q.account_id,
          lead_id: q.lead_id,
          step_no: q.step_no,
          status: 'queued',
          subject: subject,
          variant_id: variantId,
          to_email: toEmail,
          provider: q.provider ?? account.provider,
          thread_id: q.thread_id ?? null,
          unsubscribe_token: unsubToken
        })
        .select("id, unsubscribe_token")
        .single();
      if (preErr) throw preErr;

      const sendLogId = pre.id;
      const token = pre.unsubscribe_token as string;

      // 2) Render + instrument + unsubscribe footer
      let trackedHtml = instrumentHtml({ 
        html, 
        sendLogId, 
        baseUrl: APP_URL 
      });
      
      // Add unsubscribe footer
      trackedHtml = addUnsubscribeFooter(trackedHtml, APP_URL, sendLogId, token);

      // 3) Send via provider...
      const sendResult = await sendViaProvider({ ...q, to_email: toEmail, subject, body_html: trackedHtml }, access, (q.provider ?? account.provider) as any);

      // 4) Update the send_log to final 'sent' with subject/body_html/variant_id and provider_message_id
      await sb.from("send_logs").update({
        status: 'sent',
        body_html: trackedHtml,
        sent_at: new Date().toISOString(),
        unsubscribe_token: token,
        provider_message_id: sendResult.provider_message_id ?? null
      }).eq("id", sendLogId);

      await sb.from("send_queue").update({ 
        status:'sent', 
        locked_at: null,
        provider_message_id: sendResult.provider_message_id ?? null
      }).eq("id", q.id);

      await sb.from("provider_events").insert({
        account_id: account.id, provider: account.provider, kind: 'sent',
        detail: { queue_id: q.id, step: q.step_no }
      });

      ok++;
    } catch (e: any) {
      // classify
      const msg = String(e || "");
      const m = msg.match(/\b(gmail|outlook)\s+(\d{3})/i);
      const status = m ? Number(m[2]) : 0;
      const kind = classifyProviderError(status, msg, account.provider);

      // compute backoff
      const { data: cur } = await sb.from("send_queue").select("attempts").eq("id", item.id).maybeSingle();
      const attempts = (cur?.attempts ?? 0) + 1;

      // ask DB for interval value
      const { data: backoffRow } = await sb.rpc("next_backoff_after", { p_attempts: attempts }).single().catch(()=>({ data:null } as any));
      // PostgreSQL returns interval as string like "00:05:00" or PostgreSQL interval format
      const backoffStr = backoffRow?.next_backoff_after || "00:05:00";
      const runAt = new Date(Date.now() + msFromPgInterval(backoffStr)).toISOString();

      // Determine if error is permanent
      const isPermanent = /invalidrecipient|invalid_from|policy_violation|550|554|user unknown|mailbox unavailable|blocked|bounced/i.test(msg);
      
      // Map status: permanent or max attempts -> failed (will be dead lettered), transient -> retry_scheduled
      const nextStatus = (isPermanent || attempts >= 6)
        ? 'failed' 
        : (kind === "rate_limit" || kind === "provider_5xx" || kind === "other_error")
          ? 'retry_scheduled' 
          : 'failed';

      await sb.from("send_queue").update({
        status: nextStatus,
        attempts,
        attempt_count: attempts, // Keep both for compatibility
        locked_at: null,
        last_error: msg.slice(0, 800),
        last_error_at: new Date().toISOString(),
        next_attempt_at: nextStatus === 'retry_scheduled' ? runAt : null,
        run_at: nextStatus === 'retry_scheduled' ? runAt : null // Keep both for compatibility
      }).eq("id", item.id);

      await sb.from("provider_events").insert({
        account_id: account.id, provider: account.provider, kind: kind === "rate_limit" ? "rate_limit" : "error",
        detail: { queue_id: item.id, attempts, message: msg, retry_at: runAt }
      });

      if (nextStatus === 'scheduled') deferred++; else failed++;
    }
  }

  return { processed: items.length, ok, failed, deferred };
}

Deno.serve(async () => {
  try {
    // 1) gather accounts with pending work (exclude failed/retry_scheduled - those are handled by retry-dispatcher)
    const { data: queueRows } = await sb
      .from("send_queue")
      .select("account_id")
      .in("status", ["pending", "queued"]) // Only pick up pending/queued, not failed/retry_scheduled
      .lte("run_at", new Date().toISOString());

    const accountIds = [...new Set((queueRows ?? []).map((x:any)=>x.account_id).filter(Boolean))];
    
    if (accountIds.length === 0) {
      return new Response(JSON.stringify({ ok:true, summary: [] }), { headers:{ "content-type":"application/json" } });
    }

    const { data: accounts } = await sb
      .from("connected_accounts")
      .select("id,provider,send_concurrency,per_minute_cap")
      .in("id", accountIds);

    let summary:any[] = [];
    for (const acc of (accounts ?? [])) {
      const res = await processAccount(acc);
      summary.push({ account: acc.id, ...res });
    }
    return new Response(JSON.stringify({ ok:true, summary }), { headers:{ "content-type":"application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500, headers:{ "content-type":"application/json" } });
  }
});

