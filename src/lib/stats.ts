// Server-side stats tracking for mailbox health
// Helper functions to increment daily stats atomically

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Only create supabase client if we're in a server context
function getSupabase() {
  if (typeof window !== 'undefined') {
    throw new Error('stats.ts should only be used server-side');
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

export type StatField = 
  | 'sent' 
  | 'delivered' 
  | 'bounced' 
  | 'replied' 
  | 'unsubscribed' 
  | 'spam_reports' 
  | 'opens' 
  | 'clicks';

export async function incrStats(
  mailboxId: string,
  delta: Partial<Record<StatField, number>>
) {
  const supabase = getSupabase();
  const day = new Date().toISOString().slice(0, 10);

  try {
    // First, upsert to create or get the daily stats row
    const { data: row, error: upsertError } = await supabase
      .from('mailbox_daily_stats')
      .upsert(
        { 
          mailbox_id: mailboxId, 
          day,
          updated_at: new Date().toISOString()
        },
        { 
          onConflict: 'mailbox_id,day',
          ignoreDuplicates: false
        }
      )
      .select('id')
      .single();

    if (upsertError || !row) {
      console.error('Failed to upsert daily stats:', upsertError);
      return;
    }

    // Then use RPC to atomically increment all fields
    const { error: rpcError } = await supabase.rpc('incr_mailbox_daily_stats', {
      p_id: row.id,
      p_delta: delta
    });

    if (rpcError) {
      console.error('Failed to increment stats:', rpcError);
    }
  } catch (err) {
    console.error('Error in incrStats:', err);
    // Don't throw - stats tracking should never break the main flow
  }
}

export async function getMailboxStats(mailboxId: string, days: number = 30) {
  const supabase = getSupabase();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('v_mailbox_health')
    .select('*')
    .eq('mailbox_id', mailboxId)
    .gte('day', since.toISOString().slice(0, 10))
    .order('day', { ascending: true });

  if (error) {
    console.error('Failed to fetch mailbox stats:', error);
    return [];
  }

  return data || [];
}
