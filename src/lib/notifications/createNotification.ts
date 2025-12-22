/**
 * Notification creation helpers for Block 13400
 * 
 * These functions can be called from anywhere in the codebase to create notifications
 */

import { createSupabaseServer } from "@/lib/supabaseServer";

type NotificationCategory = "lead" | "task" | "call" | "campaign" | "billing";
type NotificationType = 
  | "reply" | "hot_lead" | "warm_lead" | "sms_received" | "thread_resurfaced"
  | "estimate_approved"
  | "task_assigned" | "task_due" | "task_overdue" | "task_completed"
  | "missed_call" | "call_followup_due"
  | "campaign_paused" | "campaign_limit_reached" | "deliverability_issue" | "warmup_warning"
  | "billing_issue" | "plan_limit_reached" | "subscription_past_due"
  | "system";

interface CreateNotificationParams {
  orgId: string;
  userId: string;
  category: NotificationCategory;
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: "contact" | "reply_thread" | "task" | "campaign" | "call_log";
  entityId?: string;
  url?: string;
  contactId?: string;
  replyThreadId?: string;
  taskId?: string;
  campaignId?: string;
}

/**
 * Create a notification using the V2 schema
 * This calls the database function create_notification_v2
 */
export async function createNotification(params: CreateNotificationParams): Promise<string | null> {
  try {
    const supabase = createSupabaseServer();
    
    const { data, error } = await supabase.rpc("create_notification_v2", {
      p_org_id: params.orgId,
      p_user_id: params.userId,
      p_category: params.category,
      p_type: params.type,
      p_title: params.title,
      p_body: params.body || null,
      p_entity_type: params.entityType || null,
      p_entity_id: params.entityId || null,
      p_url: params.url || null,
      p_contact_id: params.contactId || null,
      p_reply_thread_id: params.replyThreadId || null,
      p_task_id: params.taskId || null,
      p_campaign_id: params.campaignId || null,
    });

    if (error) {
      console.error("Failed to create notification:", error);
      return null;
    }

    return data || null;
  } catch (error) {
    console.error("Error creating notification:", error);
    return null;
  }
}

/**
 * Helper: Create campaign paused notification
 */
export async function notifyCampaignPaused(
  orgId: string,
  userId: string,
  campaignId: string,
  campaignName: string,
  reason?: string
): Promise<void> {
  await createNotification({
    orgId,
    userId,
    category: "campaign",
    type: "campaign_paused",
    title: `⏸️ Campaign paused: ${campaignName}`,
    body: reason 
      ? `Campaign auto-paused: ${reason} · Review and clean your list before resuming`
      : "Campaign auto-paused · Review and clean your list before resuming",
    entityType: "campaign",
    entityId: campaignId,
    url: `/campaigns/${campaignId}`,
    campaignId,
  });
}

/**
 * Helper: Create deliverability issue notification
 */
export async function notifyDeliverabilityIssue(
  orgId: string,
  userId: string,
  issueType: string,
  details?: string,
  campaignId?: string
): Promise<void> {
  await createNotification({
    orgId,
    userId,
    category: "campaign",
    type: "deliverability_issue",
    title: campaignId 
      ? `⚠️ Deliverability issue detected`
      : `⚠️ Deliverability issue`,
    body: details || "High bounce rate or reputation issue detected · Review your sending practices",
    entityType: campaignId ? "campaign" : undefined,
    entityId: campaignId,
    url: campaignId ? `/campaigns/${campaignId}` : "/campaigns",
    campaignId,
  });
}

/**
 * Helper: Create plan limit notification
 */
export async function notifyPlanLimitReached(
  orgId: string,
  userId: string,
  limitType: "emails" | "sms" | "campaigns" | "storage",
  currentUsage?: number,
  limitValue?: number
): Promise<void> {
  const body = currentUsage && limitValue
    ? `You have reached your ${limitType} limit (${currentUsage} / ${limitValue}) · Upgrade your plan to continue`
    : `You have reached your ${limitType} limit · Upgrade your plan to continue`;

  await createNotification({
    orgId,
    userId,
    category: "billing",
    type: "plan_limit_reached",
    title: `📊 Plan limit reached: ${limitType.charAt(0).toUpperCase() + limitType.slice(1)}`,
    body,
    url: "/settings/billing",
  });
}

/**
 * Helper: Create billing issue notification
 */
export async function notifyBillingIssue(
  orgId: string,
  userId: string,
  issueType: "payment_failed" | "subscription_past_due"
): Promise<void> {
  const title = issueType === "payment_failed" 
    ? "💳 Payment failed"
    : "💳 Subscription past due";
  
  const body = issueType === "payment_failed"
    ? "Your payment method failed · Update your billing information to continue service"
    : "Your subscription payment is overdue · Update your payment method";

  await createNotification({
    orgId,
    userId,
    category: "billing",
    type: "billing_issue",
    title,
    body,
    url: "/settings/billing",
  });
}



























































