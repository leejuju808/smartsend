import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildMime } from "../_shared/mime.ts";
import { sendEmail } from "../_shared/providerSend.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

type Allowance = { allowed_today: number; sent_today: number; hard_cap: number };

function wrapLinks(html: string, token: string, baseUrl: string): string {
  return html.replace(
    /href="([^"]+)"/g,
    (_, url) => `href="${baseUrl}/functions/v1/trackClick?t=${token}&u=${encodeURIComponent(url)}"`
  );
}

function injectOpenPixel(html: string, token: string, baseUrl: string): string {
  const pixel = `<img src="${baseUrl}/functions/v1/trackOpen?t=${token}" width="1" height="1" style="display:none" alt="" />`;
  return html.includes('</body>')
    ? html.replace('</body>', `${pixel}</body>`)
    : `${html}${pixel}`;
}

async function getAllowance(accountId: string): Promise<Allowance> {
  const { data, error } = await supabase.rpc('get_mailbox_allowance', { acct_id: accountId });
  if (error) throw error;
  const row = data?.[0] || {};
  return {
    allowed_today: row.allowed_today ?? 0,
    sent_today: row.sent_today ?? 0,
    hard_cap: row.hard_cap ?? 0
  };
}

function todaysBudget(a: Allowance): number {
  // Effective limit = min(warmup allowance, hard cap) - already sent
  return Math.max(0, Math.min(a.allowed_today, a.hard_cap) - a.sent_today);
}

Deno.serve(async (req) => {
  const now = new Date().toISOString();

  // 1) Get distinct accounts that have pending mail today
  const { data: accounts, error: accountsError } = await supabase
    .from('send_queue')
    .select('account_id')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .not('account_id', 'is', null);

  if (accountsError) {
    return new Response(JSON.stringify({ error: accountsError.message }), { status: 500 });
  }

  // Get unique account IDs
  const uniqueAccountIds = [...new Set((accounts || []).map((a: any) => a.account_id).filter(Boolean))] as string[];
  
  if (!uniqueAccountIds.length) {
    return new Response("No due mail");
  }

  let totalSent = 0;

  for (const accountId of uniqueAccountIds) {
    try {
      const a = await getAllowance(accountId);
      const budget = todaysBudget(a);
      
      if (budget <= 0) {
        console.log(`Account ${accountId} has no budget (sent: ${a.sent_today}, allowed: ${a.allowed_today}, cap: ${a.hard_cap})`);
        continue;
      }

      // 2) Get account info first (includes user_id and warmup settings)
      const { data: account, error: accountError } = await supabase
        .from('connected_accounts')
        .select('id, provider, email_address, from_name, user_id, warmup_enabled, warmup_started_at, warmup_plan_id, daily_cap')
        .eq('id', accountId)
        .single();

      if (accountError || !account) {
        console.error(`Account ${accountId} not found:`, accountError);
        continue;
      }

      // Health guard: pause if bounce% too high in last 3 days
      const today = new Date();
      const threeDaysAgo = new Date(today.getTime() - 3 * 86400000).toISOString().slice(0, 10);
      const { data: recent } = await supabase
        .from('v_mailbox_health')
        .select('day, sent, bounce_pct')
        .eq('mailbox_id', accountId)
        .gte('day', threeDaysAgo);
      
      const highBounce = (recent || []).some(r => r.sent >= 10 && r.bounce_pct >= 5.0);
      if (highBounce) {
        await supabase.from('send_logs').insert({
          user_id: account.user_id,
          mailbox_id: accountId,
          event: 'pause',
          detail: { reason: 'bounce_guard' }
        } as any);
        console.log(`Account ${accountId} paused due to high bounce rate`);
        continue;
      }

      // Check plan remaining for mailbox owner
      const { data: remaining } = await supabase.rpc('plan_remaining', { p_user: account.user_id })
      if ((remaining ?? 0) <= 0) {
        // log + skip this mailbox
        await supabase.from('send_logs').insert({
          user_id: account.user_id,
          campaign_id: null,
          mailbox_id: accountId,
          lead_id: null,
          event: 'retry',
          detail: { reason: 'plan_cap_reached' }
        } as any)
        continue
      }

      // Warmup enforcement: respect warmup day caps
      let warmCap = account.daily_cap ?? 40;
      if (account.warmup_enabled && account.warmup_started_at && account.warmup_plan_id) {
        const dayNo = Math.max(1, Math.floor((today.getTime() - new Date(account.warmup_started_at).getTime()) / (24 * 3600 * 1000)) + 1);
        const { data: step } = await supabase
          .from('warmup_steps')
          .select('send_cap')
          .eq('plan_id', account.warmup_plan_id)
          .eq('day_no', dayNo)
          .maybeSingle();
        
        const rampCap = step?.send_cap ?? Math.min(10 + (dayNo - 1) * 3, account.daily_cap || 40);
        warmCap = Math.min(warmCap, rampCap);
      }

      // determine batchSize with BOTH mailbox allowance, warmup cap, and plan remaining
      const batchSize = Math.min(budget, Math.max(0, remaining || 0), warmCap, 10)

      // 3) Pull up to "batchSize" due rows for this mailbox
      const { data: batch, error: batchError } = await supabase
        .from('send_queue')
        .select('*')
        .eq('status', 'pending')
        .eq('account_id', accountId)
        .lte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(batchSize);

      if (batchError) {
        console.error(`Error fetching batch for account ${accountId}:`, batchError);
        continue;
      }

      if (!batch || batch.length === 0) continue;

      // Filter out items where lead has replied
      let filteredBatch = batch;
      if (batch.length > 0) {
        const pairs = batch
          .map(q => ({ campaign_id: q.campaign_id, lead_id: q.lead_id }))
          .filter(p => p.campaign_id && p.lead_id);
        
        if (pairs.length > 0) {
          const campaignIds = [...new Set(pairs.map(p => p.campaign_id))];
          const leadIds = [...new Set(pairs.map(p => p.lead_id))];
          
          const { data: repliedPairs } = await supabase
            .from("campaign_leads")
            .select("campaign_id, lead_id")
            .in("campaign_id", campaignIds)
            .in("lead_id", leadIds)
            .not("replied_at", "is", null);
          
          const repliedSet = new Set((repliedPairs || []).map(r => `${r.campaign_id}:${r.lead_id}`));
          filteredBatch = batch.filter(q => {
            if (!q.campaign_id || !q.lead_id) return true;
            return !repliedSet.has(`${q.campaign_id}:${q.lead_id}`);
          });
        }
      }

      // Belt-and-suspenders: check remaining capacity before sending
      const { data: rem } = await supabase.rpc("account_remaining_capacity", { p_account: accountId });
      let remaining = rem ?? 0;

      for (const item of filteredBatch) {
        // Hard-stop when remaining capacity reaches 0
        if (remaining <= 0) {
          console.log(`Account ${accountId} reached daily capacity, stopping sends for this account`);
          break;
        }

        try {
          // Get recipient email - try to_email first, then recipient_email, then from lead_id
          let recipientEmail: string | null = null;
          
          if (item.to_email) {
            recipientEmail = item.to_email;
          } else if (item.recipient_email) {
            recipientEmail = item.recipient_email;
          } else if (item.lead_id) {
            const { data: lead } = await supabase
              .from("leads")
              .select("email")
              .eq("id", item.lead_id)
              .single();
            if (lead?.email) {
              recipientEmail = lead.email;
            }
          }

          if (!recipientEmail) {
            console.error(`No recipient email found for queue item ${item.id}`);
            continue;
          }

          // Use account info fetched earlier
          const fromName = account.from_name || account.email_address.split('@')[0];
          const fromEmail = account.email_address;

          // Get or generate tracking token
          let token = item.tracking_token;
          if (!token) {
            token = crypto.randomUUID();
            await supabase.from("send_queue").update({ tracking_token: token }).eq("id", item.id);
          }

          // Get HTML content and inject tracking
          // Prefer effective fields (from rewrites) if present, else fallback to original
          const subject = item.subject_effective ?? item.subject ?? '(no subject)';
          let html = item.body_html_effective ?? item.body_html ?? item.body || '';
          const text = item.plain_body || item.body_text || '';

          // Wrap links with click tracking
          const trackBaseUrl = Deno.env.get('PUBLIC_TRACK_BASE_URL') || 'https://smartsendhq.com';
          html = wrapLinks(html, token, trackBaseUrl);
          
          // Inject open tracking pixel
          html = injectOpenPixel(html, token, trackBaseUrl);

          // Generate Message-ID header for reply matching (custom Message-ID based on token)
          const messageIdHeader = `<${token}@smartsend>`;

          // Build MIME message
          const raw = buildMime({
            fromName,
            fromEmail,
            to: recipientEmail,
            subject,
            html,
            text,
            headers: {
              'X-SS-Token': token,
              'Message-ID': messageIdHeader,
              'List-Unsubscribe': `<mailto:unsubscribe@smartsendhq.com?subject=unsubscribe>, <${trackBaseUrl}/functions/v1/track_unsub?t=${token}>`
            }
          });

          // Send via provider
          const res = await sendEmail(accountId, raw);

          // Insert into send_logs
          // Use our custom Message-ID for matching (Gmail will accept it)
          // For Gmail, we also get provider_message_id from the API response
          // Store both: message_id (our custom one for matching) and provider_message_id (Gmail's ID)
          const logData: any = {
            user_id: item.user_id || null,
            campaign_id: item.campaign_id || null,
            lead_id: item.lead_id || null,
            variant_id: item.variant_id || null,
            status: "sent",
            sent_at: now,
            subject: item.subject || null,
            recipient_email: recipientEmail,
            tracking_token: token,
            message_id: messageIdHeader,  // Store our custom Message-ID for reply matching
            thread_id: res.threadId ?? null  // Store thread_id if available
          };
          
          if (item.workspace_id) logData.workspace_id = item.workspace_id;
          
          await supabase.from("send_logs").insert(logData);

          // Mark status='sent'
          await supabase
            .from("send_queue")
            .update({ status: "sent", sent_at: now })
            .eq("id", item.id);

          // Increment usage ledger
          await supabase.rpc('bump_send_usage', { acct_id: accountId, inc_by: 1 });
          
          // Track health stats: sent + delivered on success
          const day = new Date().toISOString().slice(0, 10);
          const { data: statRow } = await supabase
            .from('mailbox_daily_stats')
            .upsert({ mailbox_id: accountId, day }, { onConflict: 'mailbox_id,day' })
            .select('id').single();
          
          if (statRow?.id) {
            await supabase.rpc('incr_mailbox_daily_stats', {
              p_id: statRow.id,
              p_delta: { sent: 1, delivered: 1 }
            });
          }
          
          // Report usage to Stripe (async, don't block on failure)
          const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';
          const STRIPE_USAGE_URL = Deno.env.get('STRIPE_USAGE_URL') || '';
          if (STRIPE_USAGE_URL && item.user_id) {
            fetch(STRIPE_USAGE_URL, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${CRON_SECRET}`, 'Content-Type':'application/json' },
              body: JSON.stringify({ user_id: item.user_id, quantity: 1 })
            }).catch(err => console.error(`Failed to report usage to Stripe:`, err));
          }
          
          totalSent++;
          remaining -= 1; // Decrement remaining capacity
        } catch (e) {
          console.error(`Error processing queue item ${item.id}:`, e);
          
          const msg = String(e?.message ?? e);
          
          // Rate-limit friendly retry: reschedule + keep pending
          const isRate = /429|rate|quota/i.test(msg);
          if (isRate) {
            const backoff = new Date(Date.now() + 10*60*1000).toISOString();
            await supabase.from("send_queue").update({ scheduled_at: backoff }).eq("id", item.id);
            console.log(`Rate limited for item ${item.id}, rescheduled for ${backoff}`);
          } else {
            // Log failure
            await supabase.from("send_logs").insert({
              user_id: item.user_id || null,
              campaign_id: item.campaign_id || null,
              lead_id: item.lead_id || null,
              status: "failed",
              sent_at: now,
              recipient_email: item.to_email || item.recipient_email || null,
              subject: item.subject || null,
              error: msg
            });
            
            await supabase
              .from("send_queue")
              .update({ status: "failed", error: msg })
              .eq("id", item.id);
            
            // Track bounce on hard failure (non-rate-limit)
            const isBounce = /bounce|550|551|552|553|554|undeliverable|failure notice/i.test(msg);
            if (isBounce) {
              const day = new Date().toISOString().slice(0, 10);
              const { data: statRow } = await supabase
                .from('mailbox_daily_stats')
                .upsert({ mailbox_id: accountId, day }, { onConflict: 'mailbox_id,day' })
                .select('id').single();
              
              if (statRow?.id) {
                await supabase.rpc('incr_mailbox_daily_stats', {
                  p_id: statRow.id,
                  p_delta: { sent: 1, bounced: 1 }
                });
              }
            }
          }
        }
      }
    } catch (e) {
      console.error(`Error processing account ${accountId}:`, e);
    }
  }

  return new Response(`Tick processed (cap-aware). Sent: ${totalSent}`);
});

