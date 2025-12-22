// Block 14200 — Intent Side Effects Handler
// Shared logic for applying intent classification side effects
// Used by both edge function and API routes

import { createClient } from "@supabase/supabase-js";

type IntentLabel =
  | "hot_lead"
  | "warm_lead"
  | "follow_up"
  | "not_interested"
  | "out_of_office"
  | "wrong_contact"
  | "unsubscribe"
  | "other";

export async function handleIntentSideEffects(
  supabase: ReturnType<typeof createClient>,
  params: {
    messageId: string;
    contactId: string;
    workspaceId: string;
    label: IntentLabel;
    confidence: number;
    replyText: string;
  }
) {
  const { contactId, label, confidence, replyText, workspaceId } = params;

  // 1) Map intent → lead_status
  let leadStatus: string | null = null;

  if (label === "hot_lead") leadStatus = "hot";
  if (label === "warm_lead") leadStatus = "warm";
  if (label === "follow_up") leadStatus = "attempting";
  if (label === "not_interested" || label === "unsubscribe")
    leadStatus = "lost";

  if (leadStatus) {
    const { error: updateError } = await supabase
      .from("contacts")
      .update({ lead_status: leadStatus })
      .eq("id", contactId);

    if (updateError) {
      console.error("Failed to update lead_status:", updateError);
    }
  }

  // 1b) Map intent → pipeline_stage_id (Block 14900)
  await setPipelineStageForIntent(supabase, {
    workspaceId,
    contactId,
    label,
  });

  // 2) Log contact_activity: email_received
  const { error: activityError } = await supabase
    .from("contact_activity")
    .insert({
      contact_id: contactId,
      activity_type: "email_received",
      title: `Reply classified as ${label.replace("_", " ")}`,
      body: replyText,
      meta: {
        intent_label: label,
        intent_confidence: confidence,
      },
    });

  if (activityError) {
    console.error("Failed to log contact activity:", activityError);
  }

  // 3) Pipeline update activity for hot/warm leads
  if (leadStatus === "hot" || leadStatus === "warm") {
    await supabase.from("contact_activity").insert({
      contact_id: contactId,
      activity_type: "pipeline_update",
      title:
        leadStatus === "hot"
          ? "Marked as HOT lead"
          : "Marked as WARM lead",
      meta: {
        from_intent: label,
        lead_status: leadStatus,
      },
    });
  }

  // 4) Add to suppression if unsubscribe
  if (label === "unsubscribe") {
    // Try to get contact email
    const { data: contact } = await supabase
      .from("contacts")
      .select("email")
      .eq("id", contactId)
      .single();

    if (contact?.email) {
      // Try global_suppression_list first
      const { error: suppError } = await supabase
        .from("global_suppression_list")
        .insert({
          contact_id: contactId,
          reason: "unsubscribe_reply",
        })
        .select();

      // If that table doesn't exist, try global_suppressions
      if (suppError) {
        await supabase.from("global_suppressions").insert({
          workspace_id: params.workspaceId,
          email: contact.email,
          reason: "unsubscribe_reply",
          source: "ai_classification",
        });
      }
    }
  }

  // 5) Create a task for hot/warm/follow_up intents (Block 14700)
  if (
    label === "hot_lead" ||
    label === "warm_lead" ||
    label === "follow_up"
  ) {
    await createTaskForIntent(supabase, {
      workspaceId: params.workspaceId,
      contactId,
      label,
      replyText,
      messageId: params.messageId,
    });
  }

  // 6) Create lead_task for follow_up/warm_lead intents (Block 8720)
  if (
    label === "follow_up" ||
    label === "warm_lead" ||
    label === "hot_lead"
  ) {
    await createLeadTaskForIntent(supabase, {
      workspaceId: params.workspaceId,
      contactId,
      label,
      replyText,
    });
  }
}

/**
 * Create a task for intent labels (Block 14700)
 * hot_lead → "Call this homeowner ASAP" (due today)
 * warm_lead → "Follow up with this interested lead" (due tomorrow)
 * follow_up → "Send more info to this lead" (due in 2 days)
 */
async function createTaskForIntent(
  supabase: ReturnType<typeof createClient>,
  params: {
    workspaceId: string;
    contactId: string;
    label: IntentLabel;
    replyText: string;
    messageId: string;
  }
) {
  const { workspaceId, contactId, label, replyText, messageId } = params;

  let title: string | null = null;
  let type: "call" | "email" | "todo" = "call";
  let priority: "low" | "normal" | "high" = "high";
  const now = new Date();
  let dueAt = new Date(now);

  if (label === "hot_lead") {
    title = "CALL THIS HOT LEAD";
    dueAt = now; // today / ASAP
    priority = "high";
  } else if (label === "warm_lead") {
    title = "Follow up with this interested lead";
    dueAt.setDate(dueAt.getDate() + 1); // tomorrow
    priority = "normal";
  } else if (label === "follow_up") {
    title = "Send more info to this lead";
    dueAt.setDate(dueAt.getDate() + 2); // 2 days
    type = "email";
    priority = "normal";
  }

  if (!title) return; // only create for these labels for v1

  await supabase.from("tasks").insert({
    workspace_id: workspaceId,
    contact_id: contactId,
    email_message_id: messageId,
    title,
    description: replyText?.slice(0, 500) ?? null,
    type,
    priority,
    due_at: dueAt.toISOString(),
    status: "open",
    source: "auto",
    trigger_meta: {
      from_intent: label,
    },
  });
}

/**
 * Set pipeline stage for contact based on intent label (Block 14900)
 */
async function setPipelineStageForIntent(
  supabase: ReturnType<typeof createClient>,
  params: {
    workspaceId: string;
    contactId: string;
    label: IntentLabel;
  }
) {
  const { workspaceId, contactId, label } = params;

  let stageKey: string | null = null;

  if (label === "hot_lead") stageKey = "hot";
  else if (label === "warm_lead") stageKey = "warm";
  else if (label === "follow_up") stageKey = "attempting";
  else if (label === "not_interested" || label === "unsubscribe")
    stageKey = "lost";

  if (!stageKey) return;

  const { data: stage, error: stageError } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("key", stageKey)
    .single();

  if (stageError || !stage) {
    console.error("Failed to find pipeline stage:", stageError);
    return;
  }

  const { error: updateError } = await supabase
    .from("contacts")
    .update({ pipeline_stage_id: stage.id })
    .eq("id", contactId);

  if (updateError) {
    console.error("Failed to update pipeline_stage_id:", updateError);
  }
}

/**
 * Create a lead_task for intent labels (Block 8720)
 * Auto-creates follow-up tasks in lead_tasks table when replies are classified
 */
async function createLeadTaskForIntent(
  supabase: ReturnType<typeof createClient>,
  params: {
    workspaceId: string;
    contactId: string;
    label: IntentLabel;
    replyText: string;
  }
) {
  const { workspaceId, contactId, label } = params;

  // Get contact to find email and owner
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("email, workspace_id")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    console.error("Failed to find contact for lead_task:", contactError);
    return;
  }

  // Find lead by email in workspace
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, owner_id, workspace_id")
    .eq("workspace_id", workspaceId)
    .ilike("email", contact.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leadError) {
    console.error("Failed to find lead for lead_task:", leadError);
    return;
  }

  if (!lead) {
    // No lead found - skip creating task
    return;
  }

  // Determine owner_id: use lead's owner_id, or get workspace owner
  let ownerId: string | null = lead.owner_id;

  if (!ownerId) {
    // Get workspace owner
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();

    if (workspaceMember) {
      ownerId = workspaceMember.user_id;
    } else {
      // Fallback: get any workspace member
      const { data: anyMember } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .limit(1)
        .maybeSingle();

      if (anyMember) {
        ownerId = anyMember.user_id;
      }
    }
  }

  if (!ownerId) {
    console.error("No owner_id found for lead_task");
    return;
  }

  // Determine task title and due date
  let title: string;
  const now = new Date();
  let dueAt = new Date(now);

  if (label === "hot_lead") {
    title = "Follow up with homeowner";
    // Due today
  } else if (label === "warm_lead") {
    title = "Follow up with homeowner";
    dueAt.setDate(dueAt.getDate() + 1); // tomorrow
  } else if (label === "follow_up") {
    title = "Follow up with homeowner";
    // Due today (or could be +1 day)
  } else {
    return; // Only create for these labels
  }

  // Insert lead_task
  const { error: taskError } = await supabase.from("lead_tasks").insert({
    owner_id: ownerId,
    lead_id: lead.id,
    source: "auto_intent",
    title,
    status: "open",
    due_at: dueAt.toISOString(),
  });

  if (taskError) {
    console.error("Failed to create lead_task:", taskError);
  }
}

