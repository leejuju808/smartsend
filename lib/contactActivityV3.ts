// Block 16000 — Contact Timeline v3 Integration
// Helper functions for logging contact activity

import { SupabaseClient } from "@supabase/supabase-js";

export interface LogActivityParams {
  contactId: string;
  workspaceId: string;
  activityType:
    | "email_sent"
    | "email_opened"
    | "email_replied"
    | "intent_detected"
    | "task_created"
    | "task_completed"
    | "pipeline_stage_changed"
    | "lead_status_changed"
    | "note_added"
    | "profile_updated"
    | "list_imported"
    | "campaign_assigned"
    | "ai_opener_generated";
  title?: string;
  body?: string;
  meta?: Record<string, any>;
  createdBy?: string;
}

/**
 * Log contact activity to the contact_activity table
 * This is the unified activity stream for Block 16000
 */
export async function logContactActivityV3(
  supabase: SupabaseClient,
  params: LogActivityParams
): Promise<void> {
  try {
    const { error } = await supabase.from("contact_activity").insert({
      contact_id: params.contactId,
      workspace_id: params.workspaceId,
      activity_type: params.activityType,
      title: params.title,
      body: params.body,
      meta: params.meta || {},
      created_by: params.createdBy || null,
    });

    if (error) {
      console.error("[Contact Activity] Failed to log activity:", error);
      // Don't throw - activity logging should not break the main flow
    }
  } catch (err) {
    console.error("[Contact Activity] Unexpected error logging activity:", err);
    // Don't throw - activity logging should not break the main flow
  }
}

/**
 * Log email sent activity
 */
export async function logEmailSent(
  supabase: SupabaseClient,
  params: {
    contactId: string;
    workspaceId: string;
    campaignId?: string;
    stepId?: string;
    subject: string;
    createdBy?: string;
  }
): Promise<void> {
  await logContactActivityV3(supabase, {
    contactId: params.contactId,
    workspaceId: params.workspaceId,
    activityType: "email_sent",
    title: "Email sent",
    body: params.subject,
    meta: {
      campaign_id: params.campaignId,
      step_id: params.stepId,
    },
    createdBy: params.createdBy,
  });
}

/**
 * Log email reply activity
 */
export async function logEmailReply(
  supabase: SupabaseClient,
  params: {
    contactId: string;
    workspaceId: string;
    replyText: string;
    messageId?: string;
    createdBy?: string;
  }
): Promise<void> {
  await logContactActivityV3(supabase, {
    contactId: params.contactId,
    workspaceId: params.workspaceId,
    activityType: "email_replied",
    title: "Reply received",
    body: params.replyText.slice(0, 500), // Truncate long replies
    meta: {
      message_id: params.messageId,
    },
    createdBy: params.createdBy,
  });
}

/**
 * Log intent detection activity
 */
export async function logIntentDetected(
  supabase: SupabaseClient,
  params: {
    contactId: string;
    workspaceId: string;
    intent: string;
    summary?: string;
    keywords?: string[];
    createdBy?: string;
  }
): Promise<void> {
  await logContactActivityV3(supabase, {
    contactId: params.contactId,
    workspaceId: params.workspaceId,
    activityType: "intent_detected",
    title: `Intent: ${params.intent}`,
    body: params.summary,
    meta: {
      intent: params.intent,
      keywords: params.keywords,
    },
    createdBy: params.createdBy,
  });
}

/**
 * Log pipeline stage change activity
 */
export async function logPipelineStageChanged(
  supabase: SupabaseClient,
  params: {
    contactId: string;
    workspaceId: string;
    oldStage: string | null;
    newStage: string;
    stageLabel?: string;
    createdBy?: string;
  }
): Promise<void> {
  await logContactActivityV3(supabase, {
    contactId: params.contactId,
    workspaceId: params.workspaceId,
    activityType: "pipeline_stage_changed",
    title: `Moved to stage: ${params.stageLabel || params.newStage}`,
    meta: {
      old_stage: params.oldStage,
      new_stage: params.newStage,
    },
    createdBy: params.createdBy,
  });
}

/**
 * Log task created activity
 */
export async function logTaskCreated(
  supabase: SupabaseClient,
  params: {
    contactId: string;
    workspaceId: string;
    taskId: string;
    taskTitle: string;
    createdBy?: string;
  }
): Promise<void> {
  await logContactActivityV3(supabase, {
    contactId: params.contactId,
    workspaceId: params.workspaceId,
    activityType: "task_created",
    title: `Task: ${params.taskTitle}`,
    meta: {
      task_id: params.taskId,
    },
    createdBy: params.createdBy,
  });
}

/**
 * Log task completed activity
 */
export async function logTaskCompleted(
  supabase: SupabaseClient,
  params: {
    contactId: string;
    workspaceId: string;
    taskId: string;
    taskTitle: string;
    createdBy?: string;
  }
): Promise<void> {
  await logContactActivityV3(supabase, {
    contactId: params.contactId,
    workspaceId: params.workspaceId,
    activityType: "task_completed",
    title: `Task completed: ${params.taskTitle}`,
    meta: {
      task_id: params.taskId,
    },
    createdBy: params.createdBy,
  });
}

/**
 * Log AI opener generated activity
 */
export async function logAIOpenerGenerated(
  supabase: SupabaseClient,
  params: {
    contactId: string;
    workspaceId: string;
    openerText: string;
    stepId?: string;
    createdBy?: string;
  }
): Promise<void> {
  await logContactActivityV3(supabase, {
    contactId: params.contactId,
    workspaceId: params.workspaceId,
    activityType: "ai_opener_generated",
    title: "AI opener created",
    body: params.openerText,
    meta: {
      step_id: params.stepId,
    },
    createdBy: params.createdBy,
  });
}
