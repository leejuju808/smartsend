/**
 * Block 23610 — Intervention Service
 * Handles sending interventions to roofers
 */

import { createClient } from '@supabase/supabase-js';
import { renderScript, INTERVENTION_SCRIPTS } from './intervention-scripts';
import { resolveChurnSignal } from './monitoring-service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface SendInterventionOptions {
  workspaceId: string;
  userId: string;
  interventionType: string;
  scriptId: string;
  variables?: Record<string, string | number>;
  sentVia?: 'email' | 'sms' | 'both';
  relatedChurnSignalId?: string;
  relatedCampaignId?: string;
}

/**
 * Send an intervention message to a roofer
 */
export async function sendIntervention(options: SendInterventionOptions): Promise<string> {
  const {
    workspaceId,
    userId,
    interventionType,
    scriptId,
    variables = {},
    sentVia = 'email',
    relatedChurnSignalId,
    relatedCampaignId
  } = options;
  
  // Get user email/phone
  const { data: user } = await supabase.auth.admin.getUserById(userId);
  if (!user?.user?.email) {
    throw new Error('User not found');
  }
  
  // Render the script
  const messageText = renderScript(scriptId, variables);
  
  // Send via email
  if (sentVia === 'email' || sentVia === 'both') {
    await sendEmailIntervention(user.user.email, messageText);
  }
  
  // Send via SMS (if phone available and enabled)
  if (sentVia === 'sms' || sentVia === 'both') {
    // TODO: Implement SMS sending
    // For now, just log
    console.log('SMS intervention would be sent:', messageText);
  }
  
  // Record intervention
  const { data: intervention, error } = await supabase
    .from('retention_interventions')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      intervention_type: interventionType,
      script_template: INTERVENTION_SCRIPTS[scriptId]?.template || '',
      message_sent: messageText,
      sent_via: sentVia,
      related_churn_signal_id: relatedChurnSignalId,
      related_campaign_id: relatedCampaignId
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('Error recording intervention:', error);
    throw error;
  }
  
  // Mark churn signal as intervened if provided
  if (relatedChurnSignalId) {
    await resolveChurnSignal(relatedChurnSignalId, 'system', 'Intervention sent');
  }
  
  return intervention.id;
}

/**
 * Send email intervention
 */
async function sendEmailIntervention(to: string, message: string): Promise<void> {
  // Use Resend or your email provider
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY not set, skipping email intervention');
    return;
  }
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'SmartSend <support@smartsend.ai>',
        to,
        subject: 'Quick check-in from SmartSend',
        text: message
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send email: ${error}`);
    }
  } catch (error) {
    console.error('Error sending email intervention:', error);
    throw error;
  }
}

/**
 * Send Script A — Easy Win Fix (Day 7)
 */
export async function sendEasyWinIntervention(
  workspaceId: string,
  userId: string,
  churnSignalId?: string
): Promise<string> {
  return sendIntervention({
    workspaceId,
    userId,
    interventionType: 'script_a_easy_win',
    scriptId: 'script_a_easy_win',
    sentVia: 'email',
    relatedChurnSignalId: churnSignalId
  });
}

/**
 * Send Script B — Low Reply Fix (Day 3-5)
 */
export async function sendLowReplyIntervention(
  workspaceId: string,
  userId: string,
  churnSignalId?: string
): Promise<string> {
  return sendIntervention({
    workspaceId,
    userId,
    interventionType: 'script_b_low_reply',
    scriptId: 'script_b_low_reply',
    sentVia: 'email',
    relatedChurnSignalId: churnSignalId
  });
}

/**
 * Send Script C — Dashboard Ghost
 */
export async function sendDashboardGhostIntervention(
  workspaceId: string,
  userId: string,
  churnSignalId?: string
): Promise<string> {
  return sendIntervention({
    workspaceId,
    userId,
    interventionType: 'script_c_dashboard_ghost',
    scriptId: 'script_c_dashboard_ghost',
    sentVia: 'email',
    relatedChurnSignalId: churnSignalId
  });
}

/**
 * Send Script D — Busy Excuse
 */
export async function sendBusyExcuseIntervention(
  workspaceId: string,
  userId: string,
  churnSignalId?: string
): Promise<string> {
  return sendIntervention({
    workspaceId,
    userId,
    interventionType: 'script_d_busy_excuse',
    scriptId: 'script_d_busy_excuse',
    sentVia: 'email',
    relatedChurnSignalId: churnSignalId
  });
}






































