// Block 232000 — Automation Engine
// Core execution engine for automations

import { SupabaseClient } from "@supabase/supabase-js";
import { sendSMS } from "@/lib/providers/sms";
import { providerSend } from "@/lib/providers";

interface ExecuteAutomationParams {
  automationId: string;
  eventPayload: any;
  entityType?: string;
  entityId?: string;
  supabase: SupabaseClient;
}

interface ExecuteAutomationResult {
  success: boolean;
  logId?: string;
  actionResults?: any[];
  error?: string;
}

/**
 * Execute an automation
 */
export async function executeAutomation(
  params: ExecuteAutomationParams
): Promise<ExecuteAutomationResult> {
  const { automationId, eventPayload, entityType, entityId, supabase } = params;

  try {
    // Fetch automation with actions
    const { data: automation, error: fetchError } = await supabase
      .from("automations")
      .select(`
        *,
        automation_actions (
          id,
          action_type,
          action_payload,
          sort_order
        )
      `)
      .eq("id", automationId)
      .eq("active", true)
      .single();

    if (fetchError || !automation) {
      return {
        success: false,
        error: "Automation not found or inactive",
      };
    }

    // Check conditions
    if (!checkConditions(automation.conditions, eventPayload)) {
      return {
        success: false,
        error: "Conditions not met",
      };
    }

    // Sort actions by sort_order
    const actions = (automation.automation_actions || []).sort(
      (a: any, b: any) => a.sort_order - b.sort_order
    );

    // Execute actions in order
    const actionResults: any[] = [];
    let allSuccess = true;

    for (const action of actions) {
      try {
        const result = await executeAction(action, eventPayload, entityType, entityId, supabase);
        actionResults.push({
          action_id: action.id,
          action_type: action.action_type,
          success: result.success,
          result: result.result,
          error: result.error,
        });
        if (!result.success) {
          allSuccess = false;
        }
      } catch (error: any) {
        actionResults.push({
          action_id: action.id,
          action_type: action.action_type,
          success: false,
          error: error.message,
        });
        allSuccess = false;
      }
    }

    // Log execution
    const { data: log, error: logError } = await supabase
      .from("automation_logs")
      .insert({
        automation_id: automationId,
        event_payload: eventPayload,
        entity_type: entityType,
        entity_id: entityId,
        action_results: actionResults,
        success: allSuccess,
        error_message: allSuccess ? null : "Some actions failed",
      })
      .select()
      .single();

    if (logError) {
      console.error("[Automation Engine] Log error:", logError);
    }

    return {
      success: allSuccess,
      logId: log?.id,
      actionResults,
    };
  } catch (error: any) {
    console.error("[Automation Engine] Execution error:", error);
    return {
      success: false,
      error: error.message || "Failed to execute automation",
    };
  }
}

/**
 * Check if conditions are met
 */
function checkConditions(conditions: any, eventPayload: any): boolean {
  if (!conditions || Object.keys(conditions).length === 0) {
    return true; // No conditions = always pass
  }

  for (const [key, condition] of Object.entries(conditions)) {
    const value = eventPayload[key];
    const cond = condition as any;

    if (cond.operator === ">") {
      if (!(Number(value) > Number(cond.value))) return false;
    } else if (cond.operator === "<") {
      if (!(Number(value) < Number(cond.value))) return false;
    } else if (cond.operator === ">=") {
      if (!(Number(value) >= Number(cond.value))) return false;
    } else if (cond.operator === "<=") {
      if (!(Number(value) <= Number(cond.value))) return false;
    } else if (cond.operator === "==" || cond.operator === "=") {
      if (value !== cond.value) return false;
    } else if (cond.operator === "!=") {
      if (value === cond.value) return false;
    } else if (cond.operator === "includes") {
      if (!String(value).includes(String(cond.value))) return false;
    } else if (cond.operator === "in") {
      if (!Array.isArray(cond.value) || !cond.value.includes(value)) return false;
    }
  }

  return true;
}

/**
 * Execute a single action
 */
async function executeAction(
  action: any,
  eventPayload: any,
  entityType?: string,
  entityId?: string,
  supabase?: SupabaseClient
): Promise<{ success: boolean; result?: any; error?: string }> {
  if (!supabase) {
    return { success: false, error: "Supabase client required" };
  }

  const { action_type, action_payload } = action;

  try {
    switch (action_type) {
      case "send_email":
        return await executeSendEmail(action_payload, eventPayload, supabase);

      case "send_sms":
        return await executeSendSMS(action_payload, eventPayload, supabase);

      case "add_activity_note":
        return await executeAddActivityNote(action_payload, eventPayload, entityType, entityId, supabase);

      case "assign_user":
        return await executeAssignUser(action_payload, eventPayload, entityType, entityId, supabase);

      case "assign_crew":
        return await executeAssignCrew(action_payload, eventPayload, entityType, entityId, supabase);

      case "create_task":
        return await executeCreateTask(action_payload, eventPayload, entityType, entityId, supabase);

      case "move_pipeline_stage":
        return await executeMovePipelineStage(action_payload, eventPayload, entityType, entityId, supabase);

      case "change_status":
        return await executeChangeStatus(action_payload, eventPayload, entityType, entityId, supabase);

      case "notify_customer_portal":
        return await executeNotifyCustomerPortal(action_payload, eventPayload, entityType, entityId, supabase);

      case "apply_tags":
        return await executeApplyTags(action_payload, eventPayload, entityType, entityId, supabase);

      case "trigger_webhook":
        return await executeTriggerWebhook(action_payload, eventPayload);

      default:
        return {
          success: false,
          error: `Unknown action type: ${action_type}`,
        };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Action execution failed",
    };
  }
}

/**
 * Execute: Send Email
 */
async function executeSendEmail(
  payload: any,
  eventPayload: any,
  supabase: SupabaseClient
): Promise<{ success: boolean; result?: any; error?: string }> {
  const to = payload.to || eventPayload.email || eventPayload.homeowner_email;
  const subject = payload.subject || "Update from SmartSend";
  const body = payload.body || payload.html || "";

  if (!to) {
    return { success: false, error: "No recipient email found" };
  }

  try {
    // Get company email settings
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("id, email_domain")
      .eq("id", eventPayload.roofing_company_id || eventPayload.company_id)
      .single();

    // Use Resend or configured provider
    const result = await providerSend(
      { provider: "resend" },
      {
        to,
        subject,
        text: body.replace(/<[^>]*>/g, ""), // Strip HTML for text version
        html: body,
        from: process.env.RESEND_FROM_EMAIL || "noreply@smartsend.ai",
      }
    );

    return {
      success: result.ok,
      result: { messageId: result.messageId },
      error: result.error,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute: Send SMS
 */
async function executeSendSMS(
  payload: any,
  eventPayload: any,
  supabase: SupabaseClient
): Promise<{ success: boolean; result?: any; error?: string }> {
  const to = payload.to || eventPayload.phone || eventPayload.homeowner_phone;
  const message = payload.message || "";

  if (!to) {
    return { success: false, error: "No recipient phone found" };
  }

  try {
    // Get company SMS settings
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("id, org_id")
      .eq("id", eventPayload.roofing_company_id || eventPayload.company_id)
      .single();

    if (!company) {
      return { success: false, error: "Company not found" };
    }

    // Get org SMS config
    const { data: org } = await supabase
      .from("organizations")
      .select("sms_provider, sms_credentials")
      .eq("id", company.org_id)
      .single();

    if (!org || !org.sms_provider) {
      return { success: false, error: "SMS provider not configured" };
    }

    const smsResult = await sendSMS(to, message, {
      provider: org.sms_provider as "twilio" | "nexmo" | "telnyx",
      credentials: org.sms_credentials as any,
    });

    return {
      success: smsResult.success,
      result: { providerMessageId: smsResult.providerMessageId },
      error: smsResult.error,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute: Add Activity Note
 */
async function executeAddActivityNote(
  payload: any,
  eventPayload: any,
  entityType?: string,
  entityId?: string,
  supabase?: SupabaseClient
): Promise<{ success: boolean; result?: any; error?: string }> {
  if (!supabase) {
    return { success: false, error: "Supabase client required" };
  }

  const note = payload.note || payload.message || "";
  const entity_type = entityType || payload.entity_type;
  const entity_id = entityId || payload.entity_id;

  if (!note || !entity_type || !entity_id) {
    return { success: false, error: "Missing note, entity_type, or entity_id" };
  }

  try {
    // Insert into activity/notes table (adjust table name as needed)
    const { error } = await supabase.from("activity_logs").insert({
      entity_type,
      entity_id,
      activity_type: "automation_note",
      description: note,
      created_at: new Date().toISOString(),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, result: { note_added: true } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute: Assign User
 */
async function executeAssignUser(
  payload: any,
  eventPayload: any,
  entityType?: string,
  entityId?: string,
  supabase?: SupabaseClient
): Promise<{ success: boolean; result?: any; error?: string }> {
  if (!supabase) {
    return { success: false, error: "Supabase client required" };
  }

  const userId = payload.user_id || payload.userId;
  const entity_type = entityType || payload.entity_type || "job";
  const entity_id = entityId || payload.entity_id;

  if (!userId || !entity_id) {
    return { success: false, error: "Missing user_id or entity_id" };
  }

  try {
    // Update entity with assigned user
    const tableMap: Record<string, string> = {
      job: "roofing_jobs",
      lead: "leads",
      proposal: "proposals",
      contract: "contracts",
    };

    const table = tableMap[entity_type] || "roofing_jobs";
    const { error } = await supabase
      .from(table)
      .update({ assigned_to: userId, updated_at: new Date().toISOString() })
      .eq("id", entity_id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, result: { user_assigned: userId } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute: Assign Crew
 */
async function executeAssignCrew(
  payload: any,
  eventPayload: any,
  entityType?: string,
  entityId?: string,
  supabase?: SupabaseClient
): Promise<{ success: boolean; result?: any; error?: string }> {
  if (!supabase) {
    return { success: false, error: "Supabase client required" };
  }

  const crewId = payload.crew_id || payload.crewId;
  const entity_id = entityId || payload.entity_id || eventPayload.job_id;

  if (!crewId || !entity_id) {
    return { success: false, error: "Missing crew_id or job_id" };
  }

  try {
    // Assign crew to job
    const { error } = await supabase
      .from("roofing_jobs")
      .update({ crew_id: crewId, updated_at: new Date().toISOString() })
      .eq("id", entity_id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, result: { crew_assigned: crewId } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute: Create Task
 */
async function executeCreateTask(
  payload: any,
  eventPayload: any,
  entityType?: string,
  entityId?: string,
  supabase?: SupabaseClient
): Promise<{ success: boolean; result?: any; error?: string }> {
  if (!supabase) {
    return { success: false, error: "Supabase client required" };
  }

  const title = payload.title || payload.task_title;
  const description = payload.description || payload.task_description;
  const assignedTo = payload.assigned_to || payload.assignedTo;
  const dueDate = payload.due_date || payload.dueDate;

  if (!title) {
    return { success: false, error: "Missing task title" };
  }

  try {
    const taskData: any = {
      title,
      description,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    if (assignedTo) taskData.assigned_to = assignedTo;
    if (dueDate) taskData.due_date = dueDate;
    if (entityType && entityId) {
      taskData.entity_type = entityType;
      taskData.entity_id = entityId;
    }

    // Use roofing_tasks or tasks table
    const { data, error } = await supabase
      .from("roofing_tasks")
      .insert(taskData)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, result: { task_id: data.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute: Move Pipeline Stage
 */
async function executeMovePipelineStage(
  payload: any,
  eventPayload: any,
  entityType?: string,
  entityId?: string,
  supabase?: SupabaseClient
): Promise<{ success: boolean; result?: any; error?: string }> {
  if (!supabase) {
    return { success: false, error: "Supabase client required" };
  }

  const stage = payload.stage || payload.pipeline_stage;
  const entity_id = entityId || payload.entity_id || eventPayload.job_id || eventPayload.lead_id;

  if (!stage || !entity_id) {
    return { success: false, error: "Missing stage or entity_id" };
  }

  try {
    // Update pipeline stage
    const { error } = await supabase
      .from("roofing_jobs")
      .update({
        current_stage: stage,
        stage_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", entity_id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, result: { stage_updated: stage } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute: Change Status
 */
async function executeChangeStatus(
  payload: any,
  eventPayload: any,
  entityType?: string,
  entityId?: string,
  supabase?: SupabaseClient
): Promise<{ success: boolean; result?: any; error?: string }> {
  if (!supabase) {
    return { success: false, error: "Supabase client required" };
  }

  const status = payload.status;
  const entity_type = entityType || payload.entity_type || "job";
  const entity_id = entityId || payload.entity_id;

  if (!status || !entity_id) {
    return { success: false, error: "Missing status or entity_id" };
  }

  try {
    const tableMap: Record<string, string> = {
      job: "roofing_jobs",
      lead: "leads",
      proposal: "proposals",
      contract: "contracts",
    };

    const table = tableMap[entity_type] || "roofing_jobs";
    const { error } = await supabase
      .from(table)
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", entity_id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, result: { status_updated: status } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute: Notify Customer Portal
 */
async function executeNotifyCustomerPortal(
  payload: any,
  eventPayload: any,
  entityType?: string,
  entityId?: string,
  supabase?: SupabaseClient
): Promise<{ success: boolean; result?: any; error?: string }> {
  if (!supabase) {
    return { success: false, error: "Supabase client required" };
  }

  const message = payload.message || payload.notification;
  const entity_id = entityId || payload.entity_id || eventPayload.job_id;

  if (!message || !entity_id) {
    return { success: false, error: "Missing message or entity_id" };
  }

  try {
    // Create portal notification
    const { error } = await supabase.from("portal_notifications").insert({
      job_id: entity_id,
      message,
      type: "automation",
      created_at: new Date().toISOString(),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, result: { notification_created: true } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute: Apply Tags
 */
async function executeApplyTags(
  payload: any,
  eventPayload: any,
  entityType?: string,
  entityId?: string,
  supabase?: SupabaseClient
): Promise<{ success: boolean; result?: any; error?: string }> {
  if (!supabase) {
    return { success: false, error: "Supabase client required" };
  }

  const tags = payload.tags || [];
  const entity_type = entityType || payload.entity_type || "job";
  const entity_id = entityId || payload.entity_id;

  if (!Array.isArray(tags) || tags.length === 0 || !entity_id) {
    return { success: false, error: "Missing tags or entity_id" };
  }

  try {
    // Apply tags (adjust based on your tags implementation)
    for (const tag of tags) {
      await supabase.from("entity_tags").insert({
        entity_type,
        entity_id,
        tag,
        created_at: new Date().toISOString(),
      });
    }

    return { success: true, result: { tags_applied: tags } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute: Trigger Webhook
 */
async function executeTriggerWebhook(
  payload: any,
  eventPayload: any
): Promise<{ success: boolean; result?: any; error?: string }> {
  const url = payload.url || payload.webhook_url;

  if (!url) {
    return { success: false, error: "Missing webhook URL" };
  }

  try {
    const response = await fetch(url, {
      method: payload.method || "POST",
      headers: {
        "Content-Type": "application/json",
        ...(payload.headers || {}),
      },
      body: JSON.stringify({
        event: eventPayload,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Webhook returned ${response.status}`,
      };
    }

    return {
      success: true,
      result: { webhook_triggered: true, status: response.status },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Trigger automations for an event
 * Call this from event listeners across the platform
 */
export async function triggerAutomationsForEvent(
  roofingCompanyId: string,
  triggerType: string,
  triggerValue: string,
  eventPayload: any,
  entityType?: string,
  entityId?: string,
  supabase?: SupabaseClient
): Promise<void> {
  if (!supabase) {
    console.error("[Automation Engine] Supabase client required");
    return;
  }

  try {
    // Get active automations for this trigger
    const { data: automations, error } = await supabase.rpc(
      "get_active_automations_for_trigger",
      {
        _roofing_company_id: roofingCompanyId,
        _trigger_type: triggerType,
        _trigger_value: triggerValue,
      }
    );

    if (error) {
      console.error("[Automation Engine] Fetch error:", error);
      return;
    }

    // Execute each automation
    for (const automation of automations || []) {
      await executeAutomation({
        automationId: automation.id,
        eventPayload,
        entityType,
        entityId,
        supabase,
      });
    }
  } catch (error: any) {
    console.error("[Automation Engine] Trigger error:", error);
  }
}

























