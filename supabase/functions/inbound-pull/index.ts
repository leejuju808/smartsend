import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { GmailProvider, OutlookProvider, type Mailbox } from '../_shared/inbound-providers.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

function header(h: Record<string, string | undefined>, name: string): string {
  return (h[name] || h[name.toLowerCase()] || '') as string;
}

function parseAddress(v?: string): string {
  if (!v) return '';
  // Very loose <address> parser
  const m = v.match(/<([^>]+)>/);
  return (m?.[1] ?? v).trim().toLowerCase();
}

async function listGmailSince(mb: Mailbox): Promise<{
  nextHistoryId?: string;
  items: Array<{
    id: string;
    headers: Record<string, string>;
    snippet?: string;
  }>;
}> {
  // We fetch recent messages (last 24h) as a simple MVP
  const params = new URLSearchParams({ q: 'newer_than:1d', maxResults: '50' });
  const list = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    {
      headers: { Authorization: `Bearer ${mb.access_token}` },
    }
  ).then((r) => r.json());

  const items: any[] = [];
  for (const m of list.messages ?? []) {
    const msg = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
      {
        headers: { Authorization: `Bearer ${mb.access_token}` },
      }
    ).then((r) => r.json());

    const headers: Record<string, string> = {};
    for (const h of msg.payload?.headers ?? []) {
      headers[h.name.toLowerCase()] = h.value;
    }
    items.push({ id: m.id, headers, snippet: msg.snippet });
  }
  // Next history id (optional; we can store the largest internalDate/historyId if present)
  const nextHistoryId = list.historyId?.toString();
  return { nextHistoryId, items };
}

async function listOutlookDelta(mb: Mailbox): Promise<{
  nextLink?: string;
  items: Array<{
    id: string;
    headers: Record<string, string>;
    snippet?: string;
  }>;
}> {
  let url =
    mb.ms_delta_link ||
    'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$top=50';
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${mb.access_token}` },
  });
  const j = await r.json();
  const items: any[] = [];
  for (const m of j.value ?? []) {
    const headers: Record<string, string> = {
      from: m.from?.emailAddress?.address || '',
      to: m.toRecipients?.[0]?.emailAddress?.address || '',
      subject: m.subject || '',
      date: m.receivedDateTime || '',
    };
    items.push({
      id: m.id,
      headers,
      snippet: (m.bodyPreview || '').slice(0, 256),
    });
  }
  const nextLink = j['@odata.deltaLink'] || j['@odata.nextLink'];
  return { nextLink, items };
}

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: mbs, error } = await supabase
    .from('connected_accounts')
    .select(
      'id,user_id,provider,access_token,refresh_token,token_expires_at,email,provider_email,gmail_history_id,ms_delta_link'
    );

  if (error) return new Response(error.message, { status: 500 });

  // Map to our Mailbox type (handle both email and provider_email columns)
  const mailboxes: Mailbox[] = (mbs ?? []).map((mb: any) => ({
    id: mb.id,
    user_id: mb.user_id,
    provider: mb.provider,
    access_token: mb.access_token,
    refresh_token: mb.refresh_token,
    token_expires_at: mb.token_expires_at || mb.expires_at,
    provider_email: mb.provider_email || mb.email || null,
    gmail_history_id: mb.gmail_history_id || null,
    ms_delta_link: mb.ms_delta_link || null,
  }));

  for (const mb of mailboxes) {
    try {
      // Ensure valid token via provider refresh helper
      const provider =
        mb.provider === 'outlook'
          ? new OutlookProvider(mb, supabase)
          : new GmailProvider(mb, supabase);
      await provider.ensureToken();

      let pulled: { items: any[]; cursor?: string } = { items: [] };

      if (mb.provider === 'gmail') {
        const { items, nextHistoryId } = await listGmailSince(mb);
        pulled.items = items;
        if (nextHistoryId) pulled.cursor = nextHistoryId;
      } else {
        const { items, nextLink } = await listOutlookDelta(mb);
        pulled.items = items;
        if (nextLink) pulled.cursor = nextLink;
      }

      // Process items as inbound events
      for (const it of pulled.items) {
        const h = it.headers || {};
        const from = parseAddress(header(h, 'from') as string);
        const to = parseAddress(header(h, 'to') as string) || (mb.provider_email || '');
        const subject = (header(h, 'subject') as string) || '';
        const snippet = it.snippet || '';

        // Heuristic: if "from" equals our mailbox, skip (that's outbound)
        if (
          from &&
          mb.provider_email &&
          from.toLowerCase() === mb.provider_email.toLowerCase()
        )
          continue;

        // Find/create thread for this reply
        const { data: threadId, error: threadError } = await supabase.rpc(
          'find_or_create_thread',
          {
            p_owner: mb.user_id,
            p_from_email: from,
            p_to_email: to,
            p_subject: subject,
          }
        );

        if (threadError || !threadId) {
          console.error('Failed to find/create thread:', threadError);
          continue;
        }

        // Check for existing email_event by provider_msg_id
        const { data: exists } = await supabase
          .from('email_events')
          .select('id')
          .eq('provider_msg_id', it.id)
          .limit(1)
          .maybeSingle();

        if (!exists) {
          // Get campaign_id from thread
          const { data: threadData } = await supabase
            .from('lead_threads')
            .select('campaign_id')
            .eq('id', threadId)
            .single();

          await supabase.from('email_events').insert({
            campaign_id: threadData?.campaign_id || null,
            thread_id: threadId,
            provider_msg_id: it.id,
            direction: 'inbound',
            from_email: from,
            to_email: to,
            subject,
            snippet,
          });
        }

        // Touch the thread
        await supabase
          .from('lead_threads')
          .update({
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', threadId);
      }

      // Advance cursor
      if (pulled.cursor) {
        if (mb.provider === 'gmail') {
          await supabase
            .from('connected_accounts')
            .update({ gmail_history_id: pulled.cursor })
            .eq('id', mb.id);
        } else {
          await supabase
            .from('connected_accounts')
            .update({ ms_delta_link: pulled.cursor })
            .eq('id', mb.id);
        }
      }
    } catch (e) {
      // Soft-fail this mailbox, continue others
      console.error(`Failed to process mailbox ${mb.id}:`, e);
      // Log to send_logs if table exists, otherwise just continue
      try {
        await supabase.from('send_logs').insert({
          user_id: mb.user_id,
          campaign_id: null,
          mailbox_id: mb.id,
          lead_id: null,
          event: 'failed',
          detail: { scope: 'inbound-pull', error: String(e) },
        } as any);
      } catch (logError) {
        // Ignore log errors
      }
      continue;
    }
  }

  return new Response('ok');
});

