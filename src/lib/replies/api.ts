import { createClientComponentClient } from '@/lib/supabase';
import type { InboxRow, Message } from './types';

export async function fetchInbox({ 
  q, 
  status, 
  cursor 
}: { 
  q?: string; 
  status?: string; 
  cursor?: string 
}): Promise<InboxRow[]> {
  const supabase = createClientComponentClient();
  // Using MV directly; replace with RPC if preferred
  let query = supabase
    .from('mv_replies_inbox')
    .select('*')
    .order('last_activity_at', { ascending: false })
    .limit(30);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (q) {
    // Use text search if available, otherwise filter client-side
    try {
      query = query.or(`subject.ilike.%${q}%,lead_email.ilike.%${q}%,lead_name.ilike.%${q}%`);
    } catch {
      // Fallback if text search not available
    }
  }

  if (cursor) {
    query = query.lt('last_activity_at', cursor);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching inbox:', error);
    throw error;
  }

  const rows = (data as unknown as InboxRow[]) || [];
  const threadIds = rows.map((row) => row.thread_id).filter(Boolean);

  if (threadIds.length === 0) {
    return rows;
  }

  try {
    type ReplyEventRow = {
      thread_id: string;
      label: string | null;
      confidence: number | null;
    };

    const { data: events, error: eventError } = await supabase
      .from('v_thread_last_reply_event')
      .select('thread_id,label,confidence')
      .in('thread_id', threadIds);

    if (eventError) throw eventError;

    const eventMap = new Map<string, { label: string | null; confidence: number | null }>();
    ((events as ReplyEventRow[] | null) ?? []).forEach((evt) => {
      eventMap.set(evt.thread_id, {
        label: evt.label ?? null,
        confidence: typeof evt.confidence === 'number' ? Number(evt.confidence) : null,
      });
    });

    return rows.map((row) => {
      const evt = eventMap.get(row.thread_id);
      return {
        ...row,
        reply_event_label: evt?.label ?? row.reply_event_label ?? null,
        reply_event_confidence: evt?.confidence ?? row.reply_event_confidence ?? null,
      };
    });
  } catch (err) {
    console.warn('Failed to hydrate reply events, returning base rows', err);
    return rows;
  }
}

export async function fetchThread(thread_id: string): Promise<Message[]> {
  const supabase = createClientComponentClient();
  const { data: msgs, error } = await supabase
    .from('email_messages')
    .select('id, thread_id, sent_at, direction, from_email, from_name, to_emails, body_text, body_html, snippet, attachments, ai_label, ai_confidence, ai_reason')
    .eq('thread_id', thread_id)
    .order('sent_at', { ascending: false });

  if (error) {
    console.error('Error fetching thread:', error);
    throw error;
  }

  return (msgs as unknown as Message[]) || [];
}

export async function fetchThreadMeta(thread_id: string) {
  const supabase = createClientComponentClient();

  let campaign_id: string | null = null;
  let lead_id: string | null = null;

  const { data: emailThread } = await supabase
    .from('email_threads')
    .select('id,campaign_id,lead_id')
    .eq('id', thread_id)
    .maybeSingle();

  if (emailThread) {
    campaign_id = emailThread.campaign_id ?? null;
    lead_id = emailThread.lead_id ?? null;
  }

  if (!campaign_id || !lead_id) {
    const { data: inboxThread } = await supabase
      .from('inbox_threads')
      .select('campaign_id,lead_id')
      .eq('id', thread_id)
      .maybeSingle();

    campaign_id = campaign_id ?? inboxThread?.campaign_id ?? null;
    lead_id = lead_id ?? inboxThread?.lead_id ?? null;
  }

  if (!campaign_id || !lead_id) {
    return null;
  }

  const { data: campaignLead } = await supabase
    .from('campaign_leads')
    .select('status')
    .eq('campaign_id', campaign_id)
    .eq('lead_id', lead_id)
    .maybeSingle();

  return {
    campaign_id,
    lead_id,
    lead_status: campaignLead?.status ?? null,
  };
}

export async function setStatus(
  thread_id: string, 
  status: 'unreplied'|'replied'|'needs_review'|'archived'
): Promise<void> {
  // Map UI statuses to DB statuses
  const statusMap: Record<string, 'open' | 'replied' | 'archive'> = {
    'unreplied': 'open',
    'replied': 'replied',
    'needs_review': 'open', // Keep as open for now, or add 'needs_review' to DB constraint
    'archived': 'archive'
  };

  const dbStatus = statusMap[status] || 'open';

  const res = await fetch(`/api/threads/${thread_id}/status`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: dbStatus })
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to set status' }));
    throw new Error(errorData.error || 'Failed to set status');
  }
}

