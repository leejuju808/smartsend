import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface SendGuardResult {
  ok: boolean;
  reason?: string;
  message?: string;
}

/**
 * SmartSend Safety Net v1 - Enhanced SendGuard
 * Comprehensive safety check before sending any email
 * Checks: suppression, bounce history, complaints, disposable emails, unsubscribe history
 */
export async function shouldSend(
  workspaceId: string,
  email: string,
  campaignId?: string
): Promise<SendGuardResult> {
  try {
    // Use Safety Net's comprehensive should_send_email function
    const { data, error } = await supabase.rpc('should_send_email', {
      p_workspace_id: workspaceId,
      p_email: email,
      p_campaign_id: campaignId || null
    });

    if (error) {
      console.error('SendGuard Safety Net error:', error);
      return {
        ok: false,
        reason: 'error_checking_safety',
        message: error.message
      };
    }

    const result = data as {
      should_send: boolean;
      reason: string;
      message: string;
      suppression_reason?: string;
    };

    return {
      ok: result.should_send,
      reason: result.reason,
      message: result.message
    };
  } catch (error: any) {
    console.error('SendGuard error:', error);
    return {
      ok: false,
      reason: 'error_checking_safety',
      message: error.message || 'Unknown error checking safety'
    };
  }
}

/**
 * Log a send event (used by campaign/sequence workers)
 */
export async function logSendEvent(
  userId: string,
  email: string,
  event: 'queued' | 'sent' | 'bounced' | 'complaint' | 'opened' | 'clicked' | 'unsubscribed' | 'skipped_suppressed',
  campaignId?: string,
  meta?: Record<string, any>
) {
  try {
    await supabase
      .from('send_events')
      .insert({
        user_id: userId,
        campaign_id: campaignId,
        email: email.toLowerCase(),
        event,
        meta
      });
  } catch (error) {
    console.error('Failed to log send event:', error);
  }
}

/**
 * Add email to suppression list (SmartSend Safety Net v1)
 * Uses workspace_id instead of user_id
 */
export async function suppressEmail(
  workspaceId: string,
  email: string,
  reason: 'manual' | 'bounced' | 'complaint' | 'unsubscribed' = 'manual',
  createdByUserId?: string
) {
  try {
    // Use Safety Net's suppress_contact function
    const { data, error } = await supabase.rpc('suppress_contact', {
      p_workspace_id: workspaceId,
      p_email: email,
      p_reason: reason,
      p_created_by: createdByUserId ? 'user' : 'system',
      p_created_by_user_id: createdByUserId || null,
      p_notes: null
    });

    if (error) {
      console.error('Failed to suppress email:', error);
      return { success: false, error };
    }

    return { success: true, suppression_id: data };
  } catch (error) {
    console.error('Failed to suppress email:', error);
    return { success: false, error };
  }
} 