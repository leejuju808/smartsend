// lib/deliverability/smartRotation.ts
// Smart rotation across connected mailboxes

import { createClient } from '@supabase/supabase-js';
import { checkMailboxSafety } from './mailboxSafety';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
  }
);

/**
 * Get all available mailboxes for a user that can send
 */
export async function getAvailableMailboxes(userId: string) {
  const { data: mailboxes, error } = await supabase
    .from('mailboxes')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('sends_today', { ascending: true });

  if (error) {
    console.error('Error fetching mailboxes:', error);
    return [];
  }

  // Filter to only mailboxes that can send
  const available: typeof mailboxes = [];
  
  for (const mailbox of mailboxes || []) {
    const safety = await checkMailboxSafety(mailbox.id);
    if (safety.canSend) {
      available.push(mailbox);
    }
  }

  return available;
}

/**
 * Pick the least used mailbox from available mailboxes
 */
export async function pickLeastUsedMailbox(
  userId: string
): Promise<string | null> {
  // Use database function for optimal selection
  const { data, error } = await supabase.rpc('get_least_used_mailbox', {
    p_user_id: userId,
  });

  if (error) {
    console.error('Error picking mailbox:', error);
    return null;
  }

  return data || null;
}

/**
 * Smart rotation: Select best mailbox for sending
 * Returns mailbox ID or null if none available
 */
export async function selectMailboxForSend(
  userId: string
): Promise<{ mailboxId: string | null; reason?: string }> {
  const mailboxId = await pickLeastUsedMailbox(userId);
  
  if (!mailboxId) {
    return {
      mailboxId: null,
      reason: 'no_available_mailboxes',
    };
  }

  // Double-check safety
  const safety = await checkMailboxSafety(mailboxId);
  
  if (!safety.canSend) {
    return {
      mailboxId: null,
      reason: safety.reason || 'mailbox_unavailable',
    };
  }

  return { mailboxId };
}










