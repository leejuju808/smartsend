import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gmailSend } from '@/lib/gmail';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Send with provider-specific implementation
async function sendWithProvider(acct: any, msg: { to: string; subject: string; html: string }) {
  if (acct.provider === 'gmail') {
    return await gmailSend(acct, { to: msg.to, subject: msg.subject, html: msg.html });
  }
  throw new Error(`Unsupported provider: ${acct.provider}`);
}

function backoffDelay(attempts: number) {
  const base = Math.min(30, 2 ** attempts); // seconds
  return base * 1000;
}

export async function POST(_req: NextRequest) {
  // 1) Load all active accounts
  const { data: accounts, error: accErr } = await supabase
    .from('sending_accounts')
    .select('*');

  if (accErr) {
    console.error('Error loading accounts:', accErr);
    return NextResponse.json({ error: accErr.message }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No accounts found' });
  }

  const now = new Date().toISOString();
  let sentCount = 0;

  for (const acct of accounts) {
    try {
      // 2) Compute how many we can send this minute & left in daily cap
      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const midnightISO = midnight.toISOString();

      // Count sent in last minute for this account
      const { count: sentLastMin } = await supabase
        .from('smartsend_campaign_logs')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'email_sent')
        .gte('created_at', oneMinuteAgo);

      // Count sent today for this account
      const { count: sentToday } = await supabase
        .from('smartsend_campaign_logs')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'email_sent')
        .gte('created_at', midnightISO);

      const minuteBudget = Math.max(0, (acct.rate_limit_per_minute || 12) - (sentLastMin ?? 0));
      const dayBudget = Math.max(0, (acct.daily_cap || 150) - (sentToday ?? 0));
      const budget = Math.min(minuteBudget, dayBudget);

      if (budget <= 0) continue;

      // 3) Lock & fetch due queue items
      const { data: due, error: fetchErr } = await supabase.rpc('lock_and_fetch_queue', {
        p_provider_account_id: acct.id,
        p_now: now,
        p_limit: budget
      });

      if (fetchErr) {
        console.error('Error fetching queue:', fetchErr);
        continue;
      }

      if (!due || due.length === 0) continue;

      for (const item of due) {
        try {
          const result = await sendWithProvider(acct, {
            to: item.to_email,
            subject: item.subject,
            html: item.body_html
          });

          await supabase.from('smartsend_queue')
            .update({ status: 'sent', message_id: result.id, attempts: item.attempts + 1 })
            .eq('id', item.id);

          await supabase.from('smartsend_campaign_logs').insert({
            campaign_id: item.campaign_id,
            lead_id: item.lead_id,
            event_type: 'email_sent',
            details: { 
              queue_id: item.id, 
              provider_account_id: acct.id, 
              message_id: result.id,
              to: item.to_email 
            }
          });

          sentCount++;
        } catch (e: any) {
          const attempts = item.attempts + 1;
          const delayMs = backoffDelay(attempts);
          const nextAt = new Date(Date.now() + delayMs).toISOString();

          await supabase.from('smartsend_queue')
            .update({
              status: attempts >= 5 ? 'failed' : 'queued',
              attempts,
              last_error: String(e?.message ?? e),
              schedule_at: attempts >= 5 ? item.schedule_at : nextAt
            })
            .eq('id', item.id);

          await supabase.from('smartsend_campaign_logs').insert({
            campaign_id: item.campaign_id,
            lead_id: item.lead_id,
            event_type: 'send_failed',
            details: { 
              queue_id: item.id, 
              error: String(e?.message ?? e), 
              attempts 
            }
          });

          console.error(`Failed to send queue item ${item.id}:`, e);
        }
      }
    } catch (e: any) {
      console.error(`Error processing account ${acct.id}:`, e);
    }
  }

  return NextResponse.json({ ok: true, sent: sentCount });
}
