// lib/contactActivity.ts
// Contact Activity Timeline v2 Event Logging
// Helper functions to log all contact-related events to activity_events table

import { createServerClient } from "./supabase/service";

export interface LogContactActivityParams {
  orgId: string; // workspace_id or org_id
  contactId: string;
  type: 
    | 'email_sent'
    | 'email_opened'
    | 'reply_received'
    | 'intent_changed'
    | 'status_changed'
    | 'tag_added'
    | 'tag_removed'
    | 'task_created'
    | 'task_completed'
    | 'task_assigned'
    | 'note_added'
    | 'sequence_step_sent'
    | 'auto_followup_fired'
    | 'campaign_enrolled'
    | 'campaign_unenrolled'
    | 'contact_merged';
  title: string;
  description?: string | null;
  userId?: string | null;
  campaignId?: string | null;
  replyThreadId?: string | null;
  taskId?: string | null;
  meta?: Record<string, any>;
}

/**
 * Log a contact activity event to activity_events table
 * This is the primary logging function for Block 11200 — Contact Activity Timeline v2
 */
export async function logContactActivity(params: LogContactActivityParams): Promise<void> {
  const {
    orgId,
    contactId,
    type,
    title,
    description = null,
    userId = null,
    campaignId = null,
    replyThreadId = null,
    taskId = null,
    meta = {},
  } = params;

  try {
    const supabase = createServerClient();

    // Use the create_activity_event function if it exists, otherwise insert directly
    const { error: rpcError } = await supabase.rpc('create_activity_event', {
      p_org_id: orgId,
      p_type: type,
      p_title: title,
      p_description: description,
      p_user_id: userId,
      p_contact_id: contactId,
      p_campaign_id: campaignId,
      p_reply_thread_id: replyThreadId,
      p_task_id: taskId,
      p_metadata: meta,
    });

    if (rpcError) {
      // Fallback to direct insert if RPC doesn't exist
      const { error: insertError } = await supabase.from('activity_events').insert({
        org_id: orgId,
        user_id: userId,
        type,
        title,
        description,
        contact_id: contactId,
        campaign_id: campaignId,
        reply_thread_id: replyThreadId,
        task_id: taskId,
        metadata: meta,
        meta: meta, // Also set meta column if it exists
      });

      if (insertError) {
        console.error("[logContactActivity] Failed to log activity:", insertError);
      }
    }
  } catch (err) {
    console.error("[logContactActivity] Error logging activity:", err);
    // Don't throw - logging failures shouldn't break the app
  }
}

/**
 * Log email sent event
 */
export async function logEmailSent(
  orgId: string,
  contactId: string,
  options: {
    userId?: string | null;
    campaignId?: string | null;
    subject?: string;
    messageSnippet?: string;
    sendLogId?: string;
  } = {}
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'email_sent',
    title: `Email sent${options.subject ? `: ${options.subject}` : ''}`,
    description: options.subject || null,
    userId: options.userId,
    campaignId: options.campaignId,
    meta: {
      subject: options.subject,
      message_snippet: options.messageSnippet,
      send_log_id: options.sendLogId,
    },
  });
}

/**
 * Log reply received event
 */
export async function logReplyReceived(
  orgId: string,
  contactId: string,
  options: {
    userId?: string | null;
    replyThreadId?: string | null;
    fromEmail?: string;
    subject?: string;
    messageSnippet?: string;
    intent?: string;
    replyId?: string;
  } = {}
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'reply_received',
    title: `Reply received${options.fromEmail ? ` from ${options.fromEmail}` : ''}`,
    description: options.messageSnippet || null,
    userId: options.userId,
    replyThreadId: options.replyThreadId,
    meta: {
      from_email: options.fromEmail,
      subject: options.subject,
      message_snippet: options.messageSnippet,
      intent: options.intent,
      reply_id: options.replyId,
      thread_id: options.replyThreadId,
    },
  });
}

/**
 * Log intent changed event
 */
export async function logIntentChanged(
  orgId: string,
  contactId: string,
  options: {
    oldIntent?: string | null;
    newIntent: string;
    leadId?: string | null;
  }
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'intent_changed',
    title: `Intent changed: ${options.oldIntent || 'None'} → ${options.newIntent}`,
    userId: null,
    meta: {
      old_intent: options.oldIntent,
      new_intent: options.newIntent,
      lead_id: options.leadId,
    },
  });
}

/**
 * Log status changed event
 */
export async function logStatusChanged(
  orgId: string,
  contactId: string,
  options: {
    oldStatus?: string | null;
    newStatus: string;
    userId?: string | null;
  }
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'status_changed',
    title: `Status changed: ${options.oldStatus || 'None'} → ${options.newStatus}`,
    userId: options.userId,
    meta: {
      old_status: options.oldStatus,
      new_status: options.newStatus,
    },
  });
}

/**
 * Log tag added event
 */
export async function logTagAdded(
  orgId: string,
  contactId: string,
  tag: string,
  userId?: string | null
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'tag_added',
    title: `Tag added: ${tag}`,
    userId,
    meta: {
      tag,
    },
  });
}

/**
 * Log tag removed event
 */
export async function logTagRemoved(
  orgId: string,
  contactId: string,
  tag: string,
  userId?: string | null
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'tag_removed',
    title: `Tag removed: ${tag}`,
    userId,
    meta: {
      tag,
    },
  });
}

/**
 * Log task created event
 */
export async function logTaskCreated(
  orgId: string,
  contactId: string,
  options: {
    taskId: string;
    title: string;
    dueDate?: string | null;
    assignedTo?: string | null;
    userId?: string | null;
  }
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'task_created',
    title: `Task created: ${options.title}`,
    description: options.title,
    userId: options.userId,
    taskId: options.taskId,
    meta: {
      task_id: options.taskId,
      title: options.title,
      due_date: options.dueDate,
      assigned_to: options.assignedTo,
    },
  });
}

/**
 * Log task completed event
 */
export async function logTaskCompleted(
  orgId: string,
  contactId: string,
  options: {
    taskId: string;
    title: string;
    userId?: string | null;
  }
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'task_completed',
    title: `Task completed: ${options.title}`,
    userId: options.userId,
    taskId: options.taskId,
    meta: {
      task_id: options.taskId,
      title: options.title,
    },
  });
}

/**
 * Log task assigned event
 */
export async function logTaskAssigned(
  orgId: string,
  contactId: string,
  options: {
    taskId: string;
    title: string;
    assignedTo: string;
  }
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'task_assigned',
    title: `Task assigned: ${options.title}`,
    taskId: options.taskId,
    meta: {
      task_id: options.taskId,
      title: options.title,
      assigned_to: options.assignedTo,
    },
  });
}

/**
 * Log note added event
 */
export async function logNoteAdded(
  orgId: string,
  contactId: string,
  options: {
    noteId: string;
    noteBody: string;
    userId: string;
  }
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'note_added',
    title: 'Note added',
    description: options.noteBody,
    userId: options.userId,
    meta: {
      note_id: options.noteId,
      note_body: options.noteBody.substring(0, 200),
    },
  });
}

/**
 * Log sequence step sent event
 */
export async function logSequenceStepSent(
  orgId: string,
  contactId: string,
  options: {
    stepId: string;
    campaignId?: string | null;
    subject?: string;
    sequenceStep?: number | null;
  }
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'sequence_step_sent',
    title: `Sequence step sent${options.subject ? `: ${options.subject}` : ''}`,
    description: options.subject || null,
    campaignId: options.campaignId,
    meta: {
      step_id: options.stepId,
      campaign_id: options.campaignId,
      subject: options.subject,
      sequence_step: options.sequenceStep,
    },
  });
}

/**
 * Log auto follow-up fired event
 */
export async function logAutoFollowupFired(
  orgId: string,
  contactId: string,
  options: {
    campaignId?: string | null;
    followupType?: string;
  } = {}
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'auto_followup_fired',
    title: 'Auto follow-up fired',
    campaignId: options.campaignId,
    meta: {
      campaign_id: options.campaignId,
      followup_type: options.followupType,
    },
  });
}

/**
 * Log campaign enrolled event
 */
export async function logCampaignEnrolled(
  orgId: string,
  contactId: string,
  options: {
    campaignId: string;
    campaignName?: string;
  }
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'campaign_enrolled',
    title: `Enrolled in campaign: ${options.campaignName || 'Campaign'}`,
    campaignId: options.campaignId,
    meta: {
      campaign_id: options.campaignId,
      campaign_name: options.campaignName,
    },
  });
}

/**
 * Log campaign unenrolled event
 */
export async function logCampaignUnenrolled(
  orgId: string,
  contactId: string,
  options: {
    campaignId: string;
    campaignName?: string;
  }
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'campaign_unenrolled',
    title: `Unenrolled from campaign: ${options.campaignName || 'Campaign'}`,
    campaignId: options.campaignId,
    meta: {
      campaign_id: options.campaignId,
      campaign_name: options.campaignName,
    },
  });
}

/**
 * Log contact merged event
 */
export async function logContactMerged(
  orgId: string,
  contactId: string,
  options: {
    fromContactId: string;
    fromContactEmail?: string;
    userId?: string | null;
  }
): Promise<void> {
  return logContactActivity({
    orgId,
    contactId,
    type: 'contact_merged',
    title: `Contact merged from ${options.fromContactEmail || 'another contact'}`,
    userId: options.userId,
    meta: {
      from_contact_id: options.fromContactId,
      merged_contact_email: options.fromContactEmail,
    },
  });
}





























































