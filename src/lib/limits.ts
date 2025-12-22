import { createClient } from '@supabase/supabase-js';

export type LimitResult = {
  allowed: boolean;
  remaining: number;
  dailyLimit: number;
};

/**
 * Check if a user can send emails today
 * Returns allowed status, remaining count, and daily limit
 */
export async function canSendToday(user_id: string): Promise<LimitResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get user's subscription status and plan limits
  const { data: sub } = await supabase
    .from('v_billing_effective')
    .select('*')
    .eq('id', user_id)
    .maybeSingle();

  // BLOCK 267200: Paid gate (unpaid=25/day, paid=50/day)
  // Source of truth for paid is profiles.subscription_status -> v_billing_effective.is_paid
  const daily = sub?.is_paid ? 50 : 25;

  // Get today's usage
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase
    .from('usage_sends')
    .select('*')
    .eq('user_id', user_id)
    .eq('d', today)
    .maybeSingle();

  const used = usage?.sent_count ?? 0;

  return {
    allowed: used < daily,
    remaining: Math.max(daily - used, 0),
    dailyLimit: daily,
  };
}

/**
 * Increment send count for a user for today
 */
export async function incrementSend(user_id: string, by: number = 1): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const d = new Date().toISOString().slice(0, 10);
  
  // Try to get existing usage record
  const { data: existing } = await supabase
    .from('usage_sends')
    .select('*')
    .eq('user_id', user_id)
    .eq('d', d)
    .maybeSingle();

  if (existing) {
    // Update existing record
    await supabase
      .from('usage_sends')
      .update({ sent_count: (existing.sent_count ?? 0) + by })
      .eq('user_id', user_id)
      .eq('d', d);
  } else {
    // Insert new record
    await supabase
      .from('usage_sends')
      .insert({
        user_id,
        d,
        sent_count: by,
      });
  }
}

