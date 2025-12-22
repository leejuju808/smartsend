/**
 * Block 23610 — Win-Back Engine
 * Handles cancellations and attempts to win back roofers
 */

import { createClient } from '@supabase/supabase-js';
import { renderScript } from './intervention-scripts';
import { sendIntervention } from './intervention-service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Record a cancellation
 */
export async function recordCancellation(
  workspaceId: string,
  userId: string,
  reason?: string
): Promise<void> {
  // Check if win-back already attempted
  const { data: existing } = await supabase
    .from('winback_attempts')
    .select('id, attempt_number')
    .eq('workspace_id', workspaceId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();
  
  const attemptNumber = existing ? existing.attempt_number + 1 : 1;
  
  // Record cancellation
  const { error } = await supabase
    .from('winback_attempts')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
      attempt_number: attemptNumber,
      outcome: 'pending'
    });
  
  if (error) {
    console.error('Error recording cancellation:', error);
    throw error;
  }
}

/**
 * Send win-back attempt
 */
export async function sendWinBackAttempt(
  workspaceId: string,
  userId: string
): Promise<string | null> {
  // Get latest win-back attempt
  const { data: latest } = await supabase
    .from('winback_attempts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();
  
  if (!latest) {
    console.error('No cancellation found for win-back');
    return null;
  }
  
  // Don't send if already reactivated
  if (latest.reactivated) {
    return null;
  }
  
  // Don't send if already sent recently (wait 7 days between attempts)
  if (latest.sent_at) {
    const daysSinceLastAttempt = (Date.now() - new Date(latest.sent_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastAttempt < 7) {
      return null;
    }
  }
  
  // TODO: Create revival campaign
  // For now, we'll just send the message
  
  // Send win-back intervention
  const interventionId = await sendIntervention({
    workspaceId,
    userId,
    interventionType: 'win_back_attempt',
    scriptId: 'winback_attempt',
    sentVia: 'both'
  });
  
  // Update win-back attempt
  const { error } = await supabase
    .from('winback_attempts')
    .update({
      message_sent: renderScript('winback_attempt'),
      sent_at: new Date().toISOString(),
      sent_via: 'both'
    })
    .eq('id', latest.id);
  
  if (error) {
    console.error('Error updating win-back attempt:', error);
  }
  
  return interventionId;
}

/**
 * Mark win-back as successful (roofer reactivated)
 */
export async function markWinBackSuccess(
  workspaceId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('winback_attempts')
    .update({
      reactivated: true,
      reactivated_at: new Date().toISOString(),
      outcome: 'reactivated'
    })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .is('reactivated', null);
  
  if (error) {
    console.error('Error marking win-back success:', error);
    throw error;
  }
}

/**
 * Get all cancelled workspaces that need win-back attempts
 */
export async function getCancelledWorkspacesNeedingWinBack(): Promise<Array<{
  workspace_id: string;
  user_id: string;
  cancelled_at: string;
}>> {
  // Get win-back attempts that haven't been sent yet or need follow-up
  const { data: attempts } = await supabase
    .from('winback_attempts')
    .select('workspace_id, user_id, cancelled_at, sent_at, reactivated')
    .eq('outcome', 'pending')
    .is('reactivated', null);
  
  if (!attempts) {
    return [];
  }
  
  const now = Date.now();
  
  return attempts
    .filter(attempt => {
      // If never sent, send now
      if (!attempt.sent_at) {
        return true;
      }
      
      // If sent, wait 7 days before next attempt
      const daysSinceSent = (now - new Date(attempt.sent_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceSent >= 7;
    })
    .map(attempt => ({
      workspace_id: attempt.workspace_id,
      user_id: attempt.user_id,
      cancelled_at: attempt.cancelled_at
    }));
}






































