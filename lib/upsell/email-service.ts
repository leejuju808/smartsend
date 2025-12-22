/**
 * Block 23720 — Upgrade Email Service
 * 
 * Sends contextual upgrade emails at the right times
 */

import { createClient } from '@/lib/supabase/server';
import { PlanId } from '@/src/lib/billing/plan-limits';

interface SendUpgradeEmailOptions {
  workspaceId: string;
  userId: string;
  templateKey: string;
  triggerType: string;
  currentPlan: PlanId;
  suggestedPlan: PlanId;
  upgradeUrl: string;
}

/**
 * Send upgrade email using template
 */
export async function sendUpgradeEmail(options: SendUpgradeEmailOptions): Promise<boolean> {
  const supabase = createClient();

  try {
    // Get email template
    const { data: template, error: templateError } = await supabase
      .from('upgrade_email_templates')
      .select('*')
      .eq('template_key', options.templateKey)
      .single();

    if (templateError || !template) {
      console.error('Template not found:', options.templateKey);
      return false;
    }

    // Get user email
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(
      options.userId
    );

    if (userError || !user?.email) {
      console.error('User not found');
      return false;
    }

    // Replace template variables
    const subject = template.subject;
    const bodyHtml = template.body_html.replace('{{upgrade_url}}', options.upgradeUrl);
    const bodyText = template.body_text.replace('{{upgrade_url}}', options.upgradeUrl);

    // Send email via Resend (or your email provider)
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return false;
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SmartSend <upgrades@smartsend.ai>',
        to: user.email,
        subject,
        html: bodyHtml,
        text: bodyText,
      }),
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.text();
      console.error('Failed to send upgrade email:', error);
      return false;
    }

    // Record email sent in trigger event
    await supabase
      .from('upgrade_trigger_events')
      .update({
        email_sent_at: new Date().toISOString(),
      })
      .eq('workspace_id', options.workspaceId)
      .eq('trigger_type', options.triggerType)
      .is('email_sent_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    return true;
  } catch (error: any) {
    console.error('Error sending upgrade email:', error);
    return false;
  }
}

/**
 * Check if upgrade email should be sent based on timing
 */
export async function checkAndSendScheduledUpgradeEmails(): Promise<void> {
  const supabase = createClient();

  // Get all upgrade triggers that need emails sent
  // This would be called by a cron job or scheduled function
  const { data: triggers, error } = await supabase
    .from('upgrade_trigger_events')
    .select('*, workspaces(id), users(id)')
    .is('email_sent_at', null)
    .is('upgraded_at', null)
    .is('dismissed_at', null);

  if (error || !triggers) {
    console.error('Error fetching triggers for emails:', error);
    return;
  }

  for (const trigger of triggers) {
    // Get template based on trigger type and timing
    const templateKey = getTemplateKeyForTrigger(trigger.trigger_type, trigger.current_plan);
    
    if (!templateKey) {
      continue; // No template for this trigger
    }

    // Check timing
    const template = await supabase
      .from('upgrade_email_templates')
      .select('timing_days')
      .eq('template_key', templateKey)
      .single();

    if (template.data && template.data.timing_days) {
      const daysSinceTrigger = Math.floor(
        (Date.now() - new Date(trigger.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceTrigger < template.data.timing_days) {
        continue; // Not time yet
      }
    }

    // Send email
    const upgradeUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing?upgrade=${trigger.suggested_plan}`;
    
    await sendUpgradeEmail({
      workspaceId: trigger.workspace_id,
      userId: trigger.user_id,
      templateKey,
      triggerType: trigger.trigger_type,
      currentPlan: trigger.current_plan as PlanId,
      suggestedPlan: trigger.suggested_plan as PlanId,
      upgradeUrl,
    });
  }
}

function getTemplateKeyForTrigger(triggerType: string, currentPlan: string): string | null {
  if (triggerType === 'first_replies_received' && currentPlan === 'starter') {
    return 'starter_to_growth_day5';
  }
  if (triggerType === 'email_limit_approaching' && currentPlan === 'starter') {
    return 'starter_limit_hit';
  }
  if (triggerType === 'campaign_limit_hit' && currentPlan === 'growth') {
    return 'growth_to_domination';
  }
  return null;
}






































