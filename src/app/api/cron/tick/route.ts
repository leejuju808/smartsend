import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWithSender } from "@/lib/sendDispatch";
import { classifyError, nextBackoffSeconds } from "@/lib/sendErrors";
import { shouldPauseLeadService } from "@/lib/send/auto_pause";
import { isWithinWindow } from "@/lib/send/windows";
import { pacingRemaining } from "@/lib/send/pacing";
import { renderEmail } from "@/lib/send/render";
import { openPixelUrl, clickUrl } from "@/lib/tracking";
import { wrapLinksWithRedirect, appendOpenPixel } from "@/lib/htmlRewrite";

export const runtime = "nodejs";

const BATCH_SIZE = 2000;      // safety window for due items fetch
const LEASE_SECS = 60;      // lock timeout

export async function POST() {
  const supaSr = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const lockId = crypto.randomUUID();
  const now = new Date();

  // 1) Respect per-sender daily caps by precomputing allowed sender ids
  const { data: senders, error: sErr } = await supaSr
    .from("sender_accounts")
    .select("id,daily_cap");
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const allowedSenderIds: string[] = [];
  for (const s of senders || []) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count } = await supaSr
      .from("send_queue")
      .select("id", { head: true, count: "exact" })
      .eq("sender_account_id", s.id)
      .eq("status", "sent")
      .gte("updated_at", startOfDay.toISOString());
    if ((count ?? 0) < s.daily_cap) allowedSenderIds.push(s.id);
  }
  if (allowedSenderIds.length === 0) {
    return NextResponse.json({ ok: true, leased: 0, sent: 0, note: "all senders at cap" });
  }

  // Step A: Fetch due items (respect existing filters)
  // Honor scheduled_at <= now() for items with status 'queued', 'scheduled', or 'retrying'
  // Use coalesce(scheduled_at, not_before) for scheduling check
  const { data: dueAll, error: dueErr } = await supaSr
    .from("send_queue")
    .select("id, lead_id, campaign_id, variant_key, priority, created_at, subject, scheduled_at, not_before, send_after, sender_account_id, account_id, attempt, meta, next_attempt_at, template_version_id")
    .in("sender_account_id", allowedSenderIds)
    .in("status", ["queued", "scheduled", "retrying"])
    .or(`scheduled_at.lte.${now.toISOString()},and(scheduled_at.is.null,not_before.lte.${now.toISOString()})`)
    .lte("next_attempt_at", now.toISOString())
    .order("priority", { ascending: false })
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (dueErr) return NextResponse.json({ error: dueErr.message }, { status: 500 });
  if (!dueAll?.length) return NextResponse.json({ ok: true, leased: 0, sent: 0 });

  // Step B: Filter out paused/quiet hours etc. (reuse existing logic)
  const campaignIds = [...new Set((dueAll as any[]).map(j => j.campaign_id))];
  const leadIds = [...new Set((dueAll as any[]).map(j => j.lead_id))];
  
  const [{ data: campaigns }, { data: pausedLeads }, { data: campaignLeads }, { data: repliedLeads }, { data: campaignRules }, { data: leads }] = await Promise.all([
    supaSr.from("campaigns").select("id,is_paused,send_window_start,send_window_end,skip_weekends").in("id", campaignIds),
    supaSr.from("campaign_leads").select("id,paused_at").in("id", leadIds).not("paused_at", "is", null),
    supaSr.from("campaign_leads").select("id,timezone,campaign_id").in("id", leadIds),
    // Get campaign_leads with replied_at set for filtering
    supaSr.from("campaign_leads").select("campaign_id,lead_id").in("campaign_id", campaignIds).in("lead_id", leadIds).not("replied_at", "is", null),
    // Fetch campaign rules for respecting stop conditions
    supaSr.from("campaign_rules").select("campaign_id,stop_on_reply,stop_on_bounce,stop_on_unsubscribe,stop_on_ooh").in("campaign_id", campaignIds),
    // Fetch leads with reply_label for rule checking
    supaSr.from("leads").select("id,reply_label,replied_at").in("id", leadIds)
  ]);
  
  const pausedCampaignSet = new Set((campaigns || []).filter(c => c.is_paused).map(c => c.id));
  const pausedLeadSet = new Set((pausedLeads || []).map(l => l.id));
  // Build set of campaign_id:lead_id pairs that have replied
  const repliedSet = new Set((repliedLeads || []).map(r => `${r.campaign_id}:${r.lead_id}`));
  
  // Build campaign rules map
  const rulesMap = new Map((campaignRules || []).map((r: any) => [r.campaign_id, r]));
  
  // Build lead reply info map
  const leadReplyMap = new Map((leads || []).map((l: any) => [l.id, { reply_label: l.reply_label, replied_at: l.replied_at }]));
  
  // Build campaign window map and lead timezone map
  const campaignWindowMap = new Map((campaigns || []).map(c => [c.id, {
    startHour: c.send_window_start ?? 8,
    endHour: c.send_window_end ?? 18,
    skipWeekends: c.skip_weekends ?? true
  }]));
  
  const leadTzMap = new Map((campaignLeads || []).map(l => [l.id, l.timezone || null]));
  
  // Get unique timezones and compute offsets
  const uniqueTz = Array.from(new Set((campaignLeads || [])
    .map(l => l.timezone || "Etc/UTC")
    .filter(tz => tz && tz.trim().length > 0)));
  
  // Ensure Etc/UTC is always in the set as fallback
  if (!uniqueTz.includes("Etc/UTC")) {
    uniqueTz.push("Etc/UTC");
  }
  
  const offsetByTz = new Map<string, number>();
  
  for (const tz of uniqueTz) {
    const { data: off } = await supaSr.rpc("get_tz_offset_minutes", { tz_name: tz });
    offsetByTz.set(tz, typeof off === "number" ? off : 0);
  }

  // Helper function to check if a job is runnable based on send windows
  function isRunnable(job: any): boolean {
    const window = campaignWindowMap.get(job.campaign_id);
    if (!window) return true; // No window config = allow
    
    const tz = leadTzMap.get(job.lead_id) || "Etc/UTC";
    const offset = offsetByTz.get(tz) ?? 0;
    
    return isWithinWindow(now, offset, window);
  }

  // Filter eligible items
  const eligible = (dueAll as any[]).filter(j => {
    if (pausedCampaignSet.has(j.campaign_id)) return false;
    if (pausedLeadSet.has(j.lead_id)) return false;
    // Skip if this campaign_id:lead_id pair has replied
    if (repliedSet.has(`${j.campaign_id}:${j.lead_id}`)) return false;
    if (!isRunnable(j)) return false;
    
    // Check campaign rules
    const rules = rulesMap.get(j.campaign_id);
    const leadReply = leadReplyMap.get(j.lead_id);
    if (rules && leadReply) {
      if (leadReply.reply_label === 'bounce' && rules.stop_on_bounce) return false;
      if (leadReply.reply_label === 'ooh' && rules.stop_on_ooh) return false;
      if (leadReply.reply_label === 'unsubscribe' && rules.stop_on_unsubscribe) return false;
      if (leadReply.replied_at && rules.stop_on_reply) return false;
    }
    
    return true;
  });

  // Step C: Group by variant per campaign
  const byCampaignAndVariant = new Map<string, Map<string, any[]>>();
  for (const r of eligible) {
    const campaignKey = r.campaign_id;
    const variantKey = r.variant_key ?? "default";
    if (!byCampaignAndVariant.has(campaignKey)) {
      byCampaignAndVariant.set(campaignKey, new Map());
    }
    const variantMap = byCampaignAndVariant.get(campaignKey)!;
    if (!variantMap.has(variantKey)) {
      variantMap.set(variantKey, []);
    }
    variantMap.get(variantKey)!.push(r);
  }

  // Step D & E: Compute pacing and fair share round-robin selection
  const planned: any[] = [];
  const skippedForPacing: any[] = [];

  for (const [campaignId, variantMap] of byCampaignAndVariant.entries()) {
    const variantKeys = Array.from(variantMap.keys());
    const pacing = await pacingRemaining(campaignId, variantKeys);

    // Build queues per variant, sorted by priority then created_at
    const queues = variantKeys.map(k => ({
      key: k,
      remaining: pacing.perVariant[k]?.remaining ?? 0,
      rows: variantMap.get(k)!.sort((a, b) => {
        const priorityDiff = (b.priority ?? 100) - (a.priority ?? 100);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      })
    }));

    // Round-robin: take 1 from each until quotas or pool exhausted
    let campaignRemaining = pacing.campaign.remaining;
    while (campaignRemaining > 0) {
      let took = 0;
      for (const q of queues) {
        if (campaignRemaining <= 0) break;
        if (q.remaining <= 0) continue;
        const row = q.rows.shift();
        if (!row) continue;
        planned.push(row);
        q.remaining -= 1;
        campaignRemaining -= 1;
        took += 1;
      }
      if (took === 0) break; // no more capacity anywhere
    }

    // Collect rows that were skipped due to pacing
    for (const q of queues) {
      for (const row of q.rows) {
        skippedForPacing.push(row);
      }
    }
  }

  // Mark rows that were skipped due to pacing
  for (const row of skippedForPacing) {
    const currentMeta = (row.meta && typeof row.meta === 'object') ? row.meta : {};
    await supaSr.from("send_queue").update({
      meta: { ...currentMeta, blocked_reason: "pacing_cap" }
    }).eq("id", row.id).eq("status", "queued");
  }

  // Step F: Send only 'planned' - mark as sending and process
  let sent = 0, failed = 0, rateHeld = 0, blocked = 0;

  for (const job of planned) {
    // Mark as sending (optimistic lock)
    const { error: lockErr } = await supaSr
      .from("send_queue")
      .update({
        status: "sending",
        locked_at: now.toISOString(),
        locked_by: lockId,
        updated_at: now.toISOString()
      })
      .eq("id", job.id)
      .in("status", ["queued", "scheduled"]);
    
    if (lockErr) continue; // Already claimed by another worker
    
    try {
      const [{ data: lead, error: lErr }, { data: camp, error: cErr }] = await Promise.all([
        supaSr.from("leads").select("id,email,unsubscribed,first_name,company,title").eq("id", job.lead_id).single(),
        supaSr.from("campaigns").select("subject,body,sender_account_id,user_id").eq("id", job.campaign_id).single()
      ]);
      if (lErr || cErr || !lead || !camp) throw new Error(lErr?.message || cErr?.message || "missing lead/campaign");
      if (lead.unsubscribed) throw new Error("lead unsubscribed");

      // Guard sends with ACL: check if campaign has valid owner/editor
      if (camp?.user_id) {
        const { data: members } = await supaSr
          .from("campaign_members")
          .select("role")
          .eq("campaign_id", job.campaign_id)
          .in("role", ["owner", "editor"])
          .limit(1);
        
        if (!members || members.length === 0) {
          // No owner/editor found, mark as failed
          await supaSr.from("send_queue").update({
            status: "failed",
            error: "no_permission",
            updated_at: now.toISOString()
          }).eq("id", job.id);
          continue;
        }
      }

      // Check scheduling windows/rate/daily cap before sending
      const accountId = job.sender_account_id || (job as any).account_id || camp.sender_account_id;
      if (accountId) {
        // Get lead timezone
        const leadTz = leadTzMap.get(job.lead_id) || (lead as any).meta?.tz || (lead as any).tz || null;
        
        // Recompute next permissible send time
        const { data: nextAt, error: schedErr } = await supaSr.rpc("next_permissible_send_at", {
          p_account: accountId,
          p_lead_tz: leadTz,
          p_now: now.toISOString()
        });
        
        if (!schedErr && nextAt) {
          const nextSendTime = new Date(nextAt);
          // If we can't send now, defer
          if (nextSendTime > now) {
            await supaSr.from("send_queue")
              .update({ 
                status: "scheduled",
                attempt_after: nextAt,
                scheduled_at: nextAt,
                not_before: nextAt,
                locked_at: null,
                locked_by: null,
                updated_at: now.toISOString()
              })
              .eq("id", job.id)
              .eq("locked_by", lockId);
            continue; // skip for now
          }
        }
      }

      // Guardrails gate: check deliverability policies before sending
      if (accountId) {
        const { data: guard, error: guardErr } = await supaSr.rpc("guardrails_check", {
          p_campaign: job.campaign_id,
          p_account: accountId,
          p_now: now.toISOString()
        });

        if (!guardErr && Array.isArray(guard) && guard[0] && guard[0].ok === false) {
          // Mark queue item as skipped for now (not a failure; just delayed)
          const currentMeta = (job.meta && typeof job.meta === 'object') ? job.meta : {};
          await supaSr.from("send_queue").update({
            status: "queued", // Keep as queued so it can be retried later
            locked_at: null,
            locked_by: null,
            meta: {
              ...currentMeta,
              blocked_reason: guard[0].reason || "guardrail_block",
              guardrail_checked_at: now.toISOString()
            },
            updated_at: now.toISOString()
          }).eq("id", job.id).eq("locked_by", lockId);

          // Log activity
          await supaSr.from("activity_logs").insert({
            campaign_id: job.campaign_id,
            lead_id: job.lead_id,
            actor_id: null,
            event_type: "guardrail_blocked",
            meta: {
              reason: guard[0].reason || "guardrail_block",
              remaining_hour: guard[0].remaining_hour,
              remaining_day: guard[0].remaining_day
            }
          }).catch(() => {}); // Ignore if activity_logs doesn't exist

          blocked++;
          continue; // do not send
        }
      }

      // Check suppression before sending
      const { isSuppressed } = await import("@/lib/hygiene/suppression");
      const suppressed = await isSuppressed(camp.user_id, lead.email);
      if (suppressed.email || suppressed.domain) {
        // Cancel this queue item so it won't retry
        const currentMeta = (job.meta && typeof job.meta === 'object') ? job.meta : {};
        await supaSr.from("send_queue").update({
          status: "canceled",
          locked_at: null,
          locked_by: null,
          meta: {
            ...currentMeta,
            blocked_reason: "suppression",
            suppression_reason: suppressed.reason || "suppressed"
          },
          updated_at: now.toISOString()
        }).eq("id", job.id).eq("locked_by", lockId);

        // Log activity
        await supaSr.from("activity_logs").insert({
          campaign_id: job.campaign_id,
          lead_id: job.lead_id,
          actor_id: null,
          event_type: "suppressed_skip",
          meta: {
            email: lead.email,
            reason: suppressed.reason || "suppressed"
          }
        });

        // Block 9950: Log suppression event for health monitoring
        try {
          // Get account_id from campaign
          const accountId = camp.account_id || camp.user_id || camp.workspace_id;
          if (accountId) {
            // Get contact_id if available
            const { data: contact } = await supaSr
              .from("contacts")
              .select("id")
              .eq("workspace_id", camp.workspace_id || accountId)
              .ilike("email", lead.email)
              .maybeSingle();
            
            await supaSr.rpc("log_delivery_event", {
              p_account_id: accountId,
              p_campaign_id: job.campaign_id,
              p_contact_id: contact?.id || null,
              p_message_id: null,
              p_event_type: "dropped_suppressed",
              p_provider_message_id: null,
              p_provider_error_code: null,
              p_provider_error_message: suppressed.reason || "suppressed"
            });
          }
        } catch (logErr) {
          console.error("Failed to log suppression event:", logErr);
        }

        blocked++;
        continue; // do not send
      }

      // Check for forced snapshot (resend)
      const meta = job.meta || {};
      const isForced = meta.kind === "resend_snapshot" && meta.force_html;

      let subjectToSend = job.subject || camp.subject;
      let htmlToSend: string | null = null;

      if (isForced) {
        // Use forced snapshot from meta
        subjectToSend = meta.force_subject || job.subject || camp.subject || "(no subject)";
        htmlToSend = meta.force_html;
      } else {
        // Normal render path - load template version if available, otherwise use campaign defaults
        let subjectTpl = camp.subject;
        let bodyMdTpl = typeof camp.body === "string" ? camp.body : JSON.stringify(camp.body);
        
        if (job.template_version_id) {
          const { data: tv } = await supaSr
            .from("template_versions")
            .select("subject, body_md")
            .eq("id", job.template_version_id)
            .maybeSingle();
          if (tv) {
            subjectTpl = tv.subject;
            bodyMdTpl = tv.body_md;
          }
        }

        // Build vars for rendering
        const vars = {
          first_name: lead.first_name ?? "",
          company: lead.company ?? "",
          title: lead.title ?? "",
          email: lead.email ?? "",
        };

        // Render snapshot
        const snapshot = renderEmail(subjectTpl, bodyMdTpl, vars);
        subjectToSend = snapshot.subject;
        htmlToSend = snapshot.html;
      }

      // 0) Ensure thread before sending (ensures linkage works)
      const { data: ensuredThread } = await supaSr.rpc("ensure_thread", {
        p_campaign: job.campaign_id,
        p_lead: job.lead_id,
      });
      const threadId = ensuredThread as string | null;

      // 1) Pre-create a log row to obtain send_log_id (for tracking URLs)
      const { data: logInserted, error: logErr } = await supaSr
        .from('send_logs')
        .insert({
          queue_id: job.id,
          campaign_id: job.campaign_id,
          account_id: camp.sender_account_id ?? null,
          thread_id: threadId, // Link log to thread
          lead_id: job.lead_id,
          step_no: job.step_no ?? null,
          variant_id: (job as any).variant_id ?? null,
          to_email: lead.email,
          subject: subjectToSend,
          subject_snapshot: subjectToSend,
          body_preview: (htmlToSend || '').slice(0, 200).replace(/<[^>]*>/g, ''), // First 200 chars, no HTML tags
          provider: 'sim', // change to 'gmail' or 'outlook' when real sender used
          status: 'sending'
        })
        .select('id')
        .single();

      if (logErr || !logInserted) {
        throw new Error(logErr?.message || "Failed to create send log");
      }
      const sendLogId = logInserted.id as string;

      // 2) Build tracking URLs
      const pixel = openPixelUrl(sendLogId, lead.email);

      const { data: unsubTok, error: unsubErr } = await supaSr.rpc("mint_unsubscribe_token", {
        p_campaign: job.campaign_id,
        p_lead: job.lead_id,
        p_send_log: sendLogId,
        p_email: lead.email,
        p_ttl_minutes: 0
      });

      if (unsubErr || !unsubTok) {
        throw new Error(unsubErr?.message || "Failed to mint unsubscribe token");
      }

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL
        || process.env.NEXT_PUBLIC_SITE_URL
        || (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : "http://localhost:3000"))
        .replace(/\/$/, "");
      const unsubUrl = `${appUrl}/u/${unsubTok}`;

      // 3) Replace unsubscribe placeholders if present and wrap links & append tracking + footer
      let finalHtml = htmlToSend || "";
      finalHtml = finalHtml.replaceAll("{{unsubscribe_url}}", unsubUrl);
      finalHtml = wrapLinksWithRedirect(finalHtml, (u: string) => clickUrl(sendLogId, u));
      finalHtml = appendOpenPixel(finalHtml, pixel);

      const footer = `\n  <div style="margin-top:16px;font-size:12px;color:#6b7280">\n    Don't want emails about this? <a href="${unsubUrl}" style="color:#93c5fd">Unsubscribe</a>.\n  </div>`;

      if (/(<\/body>)/i.test(finalHtml)) {
        finalHtml = finalHtml.replace(/<\/body>/i, `${footer}</body>`);
      } else {
        finalHtml += footer;
      }

      // 4) Send email via provider
      const result = await sendWithSender({
        senderAccountId: camp.sender_account_id,
        to: lead.email,
        subject: subjectToSend,
        textOrHtml: finalHtml,
        campaignId: job.campaign_id,
        leadId: job.lead_id
      });

      // Extract Message-ID for deep linking
      const messageId =
        result.headers?.["Message-Id"] ||
        result.headers?.["message-id"] ||
        result.messageId || null;

      // Generate deep link
      const { providerDeepLink } = await import("@/lib/send/provider-links");
      const providerUrl =
        result.threadUrl ??
        providerDeepLink(result.provider, messageId) ??
        null;

      const sentAt = new Date().toISOString();
      const providerMessageId = result.messageId || messageId;
      const providerThreadId = result.threadId || null;

      // If we have a messageId, assume success (sendWithSender throws on error)
      // Mark queue + log as sent
      await supaSr.from("send_queue").update({
        status: "sent",
        locked_at: null,
        locked_by: null,
        reason: null,
        error_code: null,
        updated_at: sentAt
      }).eq("id", job.id).eq("locked_by", lockId);

      // 5) Update log with provider IDs
      await supaSr.from("send_logs").update({
        status: 'sent',
        sent_at: sentAt,
        provider_message_id: providerMessageId,
        provider_thread_id: providerThreadId,
        provider: result.provider || 'unknown',
        updated_at: sentAt
      }).eq("id", sendLogId);

      // Also insert/update legacy send_logs if it exists with different schema
      // (keeping for backward compatibility)
      try {
        await supaSr.from("send_logs").upsert({
          queue_id: job.id,
          campaign_id: job.campaign_id,
          lead_id: job.lead_id,
          variant_key: job.variant_key ?? null,
          template_version_id: job.template_version_id ?? null,
          sent_at: sentAt,
          status: "sent",
          event: "sent",
          subject_rendered: subjectToSend,
          html_rendered: htmlToSend,
          headers: result.headers ?? (messageId ? { "Message-Id": messageId } : null),
          provider_url: providerUrl,
          provider_message_id: providerMessageId,
          provider: result.provider,
        }, { onConflict: 'queue_id' }); // Ignore if columns don't exist
      } catch (e) {
        // Schema mismatch - ignore
      }

      // Block 9950: Log sent event for health monitoring
      try {
        // Get account_id from campaign
        const accountId = camp.account_id || camp.user_id || camp.workspace_id;
        if (accountId) {
          // Get contact_id if available
          const { data: contact } = await supaSr
            .from("contacts")
            .select("id")
            .eq("workspace_id", camp.workspace_id || accountId)
            .ilike("email", lead.email)
            .maybeSingle();
          
          // Get message_id if available from send_logs
          await supaSr.rpc("log_delivery_event", {
            p_account_id: accountId,
            p_campaign_id: job.campaign_id,
            p_contact_id: contact?.id || null,
            p_message_id: sendLogId || null,
            p_event_type: "sent",
            p_provider_message_id: providerMessageId || null,
            p_provider_error_code: null,
            p_provider_error_message: null
          });
        }
      } catch (logErr) {
        console.error("Failed to log sent event:", logErr);
      }

      sent++;
    } catch (e: any) {
      // Get or create log entry for this failure (should already exist from step 1)
      let logId: string | null = null;
      try {
        const { data: existingLog } = await supaSr
          .from('send_logs')
          .select('id')
          .eq('queue_id', job.id)
          .eq('status', 'sending')
          .maybeSingle();
        
        if (existingLog) {
          logId = existingLog.id;
        } else {
          // Create log entry if we don't have one (fallback)
          const [{ data: lead }, { data: camp }] = await Promise.all([
            supaSr.from("leads").select("id,email").eq("id", job.lead_id).single(),
            supaSr.from("campaigns").select("sender_account_id").eq("id", job.campaign_id).single()
          ]);
          if (lead && camp) {
            const { data: newLog } = await supaSr
              .from('send_logs')
              .insert({
                queue_id: job.id,
                campaign_id: job.campaign_id,
                account_id: camp.sender_account_id ?? null,
                lead_id: job.lead_id,
                step_no: job.step_no ?? null,
                variant_id: (job as any).variant_id ?? null,
                to_email: lead.email,
                status: 'sending'
              })
              .select('id')
              .single();
            logId = newLog?.id ?? null;
          }
        }
      } catch (logErr) {
        // Ignore log creation errors
      }

      const cls = classifyError(e);
      const errorMsg = cls.message || String(e);
      
      // Update log to failed if we have one
      if (logId) {
        try {
          await supaSr.from("send_logs").update({
            status: 'failed',
            error: errorMsg,
            updated_at: new Date().toISOString()
          }).eq("id", logId);
        } catch (updateErr) {
          // Ignore update errors
        }
      }

      // Block 9950: Log send error event for health monitoring
      try {
        const [{ data: lead }, { data: camp }] = await Promise.all([
          supaSr.from("leads").select("id,email").eq("id", job.lead_id).maybeSingle(),
          supaSr.from("campaigns").select("account_id,user_id,workspace_id").eq("id", job.campaign_id).maybeSingle()
        ]);
        
        if (camp) {
          const accountId = camp.account_id || camp.user_id || camp.workspace_id;
          if (accountId && lead) {
            // Get contact_id if available
            const { data: contact } = await supaSr
              .from("contacts")
              .select("id")
              .eq("workspace_id", camp.workspace_id || accountId)
              .ilike("email", lead.email)
              .maybeSingle();
            
            await supaSr.rpc("log_delivery_event", {
              p_account_id: accountId,
              p_campaign_id: job.campaign_id,
              p_contact_id: contact?.id || null,
              p_message_id: logId || null,
              p_event_type: "send_error",
              p_provider_message_id: null,
              p_provider_error_code: cls.type || "unknown",
              p_provider_error_message: errorMsg
            });
          }
        }
      } catch (logErr) {
        console.error("Failed to log send error event:", logErr);
      }

      if (cls.type === "rate") {
        rateHeld++;
        const hold = 60; // 1 minute
        await supaSr.from("send_queue").update({
          status: "queued",
          send_after: new Date(Date.now() + hold * 1000).toISOString(),
          locked_at: null,
          locked_by: null,
          reason: cls.message,
          error_code: cls.code,
          updated_at: new Date().toISOString()
        }).eq("id", job.id).eq("locked_by", lockId);
      } else if (cls.type === "transient") {
        const backoff = nextBackoffSeconds(job.attempt || 0);
        await supaSr.from("send_queue").update({
          status: "queued",
          send_after: new Date(Date.now() + backoff * 1000).toISOString(),
          locked_at: null,
          locked_by: null,
          reason: cls.message,
          error_code: cls.code,
          updated_at: new Date().toISOString()
        }).eq("id", job.id).eq("locked_by", lockId);

        await supaSr.from("leads").update({ attempt: (job.attempt ?? 0) + 1, last_error: cls.message }).eq("id", job.lead_id);
      } else {
        await supaSr.from("send_queue").update({
          status: "failed",
          reason: cls.message,
          error_code: cls.code,
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString()
        }).eq("id", job.id).eq("locked_by", lockId);
        await supaSr.from("leads").update({ last_error: cls.message }).eq("id", job.lead_id);
        
        // Check if we should auto-pause this lead
        const doPause = await shouldPauseLeadService(job.campaign_id, job.lead_id);
        if (doPause) {
          await supaSr.from("campaign_leads").update({
            paused_at: new Date().toISOString(),
            paused_by: null,
            pause_reason: "consecutive_failures"
          }).eq("id", job.lead_id).eq("campaign_id", job.campaign_id);
          
          await supaSr.from("activity_logs").insert({
            campaign_id: job.campaign_id,
            lead_id: job.lead_id,
            actor_id: null,
            event_type: "lead_paused",
            meta: { reason: "consecutive_failures" }
          });
        }
        
        failed++;
      }
    }
  }

  return NextResponse.json({ ok: true, planned: planned.length, sent, failed, rateHeld, blocked });
}


