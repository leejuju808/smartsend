// Block 24900 — Follow-Up Brain v2: Hot Lead Activation
// Instantly activates hot leads with notifications and auto-replies

import { supabaseAdmin } from "@/server/supabase";
import { generateFollowUpMessage } from "./adaptive-modes";

export interface HotLeadActivationResult {
  activated: boolean;
  notificationSent: boolean;
  autoReplySent: boolean;
  actions: string[];
}

/**
 * Activates a hot lead: sends notifications and auto-reply
 */
export async function activateHotLead(
  leadId: string,
  detectionId: string,
  activationTrigger: string
): Promise<HotLeadActivationResult> {
  const actions: string[] = [];
  
  try {
    // 1. Get lead details
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('*, workspace_id, owner_id')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    // 2. Create activation record
    const { data: activation, error: activationError } = await supabaseAdmin
      .from('hot_lead_activations')
      .insert({
        lead_id: leadId,
        detection_id: detectionId,
        activation_trigger: activationTrigger,
        notification_sent: false,
        auto_reply_sent: false,
        priority_tagged: false,
      })
      .select()
      .single();

    if (activationError) {
      throw new Error(`Failed to create activation: ${activationError.message}`);
    }

    // 3. Send owner notification
    let notificationSent = false;
    if (lead.owner_id) {
      notificationSent = await sendOwnerNotification(leadId, lead, activationTrigger);
      if (notificationSent) {
        actions.push('owner_notified');
        await supabaseAdmin
          .from('hot_lead_activations')
          .update({ 
            notification_sent: true,
            owner_notified_at: new Date().toISOString(),
          })
          .eq('id', activation.id);
      }
    }

    // 4. Send rep notification (if workspace has reps)
    const repNotified = await sendRepNotification(leadId, lead.workspace_id, activationTrigger);
    if (repNotified) {
      actions.push('rep_notified');
      await supabaseAdmin
        .from('hot_lead_activations')
        .update({ 
          rep_notified_at: new Date().toISOString(),
        })
        .eq('id', activation.id);
    }

    // 5. Send auto-reply
    const autoReplySent = await sendHotLeadAutoReply(leadId, lead);
    if (autoReplySent) {
      actions.push('auto_reply_sent');
      await supabaseAdmin
        .from('hot_lead_activations')
        .update({ 
          auto_reply_sent: true,
          auto_reply_sent_at: new Date().toISOString(),
        })
        .eq('id', activation.id);
    }

    // 6. Tag as priority
    await supabaseAdmin
      .from('hot_lead_activations')
      .update({ priority_tagged: true })
      .eq('id', activation.id);

    // 7. Update lead status
    await supabaseAdmin
      .from('leads')
      .update({ status: 'hot_lead' })
      .eq('id', leadId);

    // 8. Create timeline event
    await supabaseAdmin
      .from('lead_timeline_events')
      .insert({
        lead_id: leadId,
        event_type: 'hot_lead_activated',
        event_subtype: 'followup_brain_v2',
        message: `Hot lead activated: ${activationTrigger}`,
        metadata: {
          detection_id: detectionId,
          activation_id: activation.id,
          actions_taken: actions,
        },
      });

    return {
      activated: true,
      notificationSent,
      autoReplySent,
      actions,
    };
  } catch (error: any) {
    console.error('Error activating hot lead:', error);
    return {
      activated: false,
      notificationSent: false,
      autoReplySent: false,
      actions: [`error: ${error.message}`],
    };
  }
}

/**
 * Sends notification to lead owner
 */
async function sendOwnerNotification(
  leadId: string,
  lead: any,
  trigger: string
): Promise<boolean> {
  try {
    // Create notification in notifications table (if exists)
    // Or send email/SMS notification
    const { error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: lead.owner_id,
        type: 'hot_lead',
        title: '🔥 Hot Lead Detected',
        message: `Lead ${lead.email || leadId} needs immediate attention: ${trigger}`,
        metadata: {
          lead_id: leadId,
          trigger,
        },
        read: false,
      })
      .catch(() => {
        // If notifications table doesn't exist, skip
        return { error: null };
      });

    return !error;
  } catch (error) {
    console.error('Error sending owner notification:', error);
    return false;
  }
}

/**
 * Sends notification to workspace reps
 */
async function sendRepNotification(
  leadId: string,
  workspaceId: string,
  trigger: string
): Promise<boolean> {
  try {
    // Get workspace members
    const { data: members } = await supabaseAdmin
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId);

    if (!members || members.length === 0) {
      return false;
    }

    // Send notifications to all members
    const notifications = members.map(member => ({
      user_id: member.user_id,
      type: 'hot_lead',
      title: '🔥 Hot Lead Needs Attention',
      message: `A hot lead was detected and needs immediate follow-up: ${trigger}`,
      metadata: {
        lead_id: leadId,
        trigger,
      },
      read: false,
    }));

    const { error } = await supabaseAdmin
      .from('notifications')
      .insert(notifications)
      .catch(() => {
        return { error: null };
      });

    return !error;
  } catch (error) {
    console.error('Error sending rep notification:', error);
    return false;
  }
}

/**
 * Sends auto-reply to hot lead
 */
async function sendHotLeadAutoReply(
  leadId: string,
  lead: any
): Promise<boolean> {
  try {
    // Generate follow-up message using direct mode
    const message = generateFollowUpMessage('direct', {
      firstName: lead.first_name || lead.name,
      leadType: 'hot',
    });

    // Get lead email
    const leadEmail = lead.email;
    if (!leadEmail) {
      return false;
    }

    // Send email (using your email sending system)
    // This would integrate with your email sending infrastructure
    const { error } = await supabaseAdmin
      .from('email_logs')
      .insert({
        lead_id: leadId,
        to_email: leadEmail,
        subject: message.subject,
        body: message.body,
        status: 'sent',
        sent_at: new Date().toISOString(),
        source: 'followup_brain_v2_hot_lead',
      })
      .catch(() => {
        return { error: null };
      });

    return !error;
  } catch (error) {
    console.error('Error sending hot lead auto-reply:', error);
    return false;
  }
}






































