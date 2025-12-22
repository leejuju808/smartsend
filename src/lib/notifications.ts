import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

/**
 * Create a notification for a new reply
 */
export async function createReplyNotification(params: {
  orgId: string;
  userId: string;
  contactId: string;
  replyThreadId: string;
  campaignId?: string;
  messageSnippet?: string;
}): Promise<string | null> {
  const supabase = createSupabaseServer();

  try {
    const { data, error } = await supabase.rpc("create_reply_notification", {
      p_org_id: params.orgId,
      p_user_id: params.userId,
      p_contact_id: params.contactId,
      p_reply_thread_id: params.replyThreadId,
      p_campaign_id: params.campaignId || null,
      p_message_snippet: params.messageSnippet || null,
    });

    if (error) {
      console.error("Failed to create reply notification:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error creating reply notification:", error);
    return null;
  }
}

/**
 * Create a notification for a hot/warm lead
 */
export async function createLeadIntentNotification(params: {
  orgId: string;
  userId: string;
  contactId: string;
  replyThreadId?: string;
  campaignId?: string;
  intent: "hot" | "warm";
}): Promise<string | null> {
  const supabase = createSupabaseServer();

  try {
    const { data, error } = await supabase.rpc("create_lead_intent_notification", {
      p_org_id: params.orgId,
      p_user_id: params.userId,
      p_contact_id: params.contactId,
      p_reply_thread_id: params.replyThreadId || null,
      p_campaign_id: params.campaignId || null,
      p_intent: params.intent,
    });

    if (error) {
      console.error("Failed to create lead intent notification:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error creating lead intent notification:", error);
    return null;
  }
}

/**
 * Create a notification for a task due
 */
export async function createTaskDueNotification(params: {
  orgId: string;
  userId: string;
  taskId: string;
  contactId?: string;
  campaignId?: string;
}): Promise<string | null> {
  const supabase = createSupabaseServer();

  try {
    const { data, error } = await supabase.rpc("create_task_due_notification", {
      p_org_id: params.orgId,
      p_user_id: params.userId,
      p_task_id: params.taskId,
      p_contact_id: params.contactId || null,
      p_campaign_id: params.campaignId || null,
    });

    if (error) {
      console.error("Failed to create task due notification:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error creating task due notification:", error);
    return null;
  }
}

/**
 * Get the user_id who should receive notifications for a contact/campaign
 * For now, assumes 1 primary "owner" user per contact/campaign
 */
export async function getNotificationUserId(params: {
  contactId?: string;
  campaignId?: string;
  leadId?: string;
}): Promise<string | null> {
  const supabase = createSupabaseServer();

  // Try to get owner from campaign
  if (params.campaignId) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("user_id, owner_id, org_id")
      .eq("id", params.campaignId)
      .maybeSingle();

    if (campaign) {
      // Try owner_id first, then user_id
      const userId = campaign.owner_id || campaign.user_id;
      if (userId) return userId;
    }
  }

  // Try to get owner from lead
  if (params.leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("user_id, owner_id, campaign_id")
      .eq("id", params.leadId)
      .maybeSingle();

    if (lead) {
      const userId = lead.owner_id || lead.user_id;
      if (userId) return userId;

      // Fallback to campaign owner
      if (lead.campaign_id) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("user_id, owner_id")
          .eq("id", lead.campaign_id)
          .maybeSingle();

        if (campaign) {
          return campaign.owner_id || campaign.user_id || null;
        }
      }
    }
  }

  // Try to get owner from contact
  if (params.contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("workspace_id, user_id")
      .eq("id", params.contactId)
      .maybeSingle();

    if (contact?.user_id) {
      return contact.user_id;
    }
  }

  return null;
}

/**
 * Get org_id from various sources
 */
export async function getNotificationOrgId(params: {
  contactId?: string;
  campaignId?: string;
  leadId?: string;
}): Promise<string | null> {
  const supabase = createSupabaseServer();

  // Try campaign first
  if (params.campaignId) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("org_id")
      .eq("id", params.campaignId)
      .maybeSingle();

    if (campaign?.org_id) return campaign.org_id;
  }

  // Try lead
  if (params.leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("org_id, campaign_id")
      .eq("id", params.leadId)
      .maybeSingle();

    if (lead?.org_id) return lead.org_id;

    // Fallback to campaign org_id
    if (lead?.campaign_id) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("org_id")
        .eq("id", lead.campaign_id)
        .maybeSingle();

      if (campaign?.org_id) return campaign.org_id;
    }
  }

  // Try contact
  if (params.contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("workspace_id")
      .eq("id", params.contactId)
      .maybeSingle();

    // workspace_id might be org_id in some schemas
    if (contact?.workspace_id) return contact.workspace_id as string;
  }

  // Fallback to current org
  return await getCurrentOrgId();
}
