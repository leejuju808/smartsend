// lib/workflows/applyAutoWorkflows.ts
// Block 16100 — Simple Workflow Automation Engine
// This is the brain you call when something happens.

import { createClient } from "@/lib/supabase/server";
import { getAutoWorkflows } from "./getAutoWorkflows";

export type IntentLabel =
  | "hot_lead"
  | "warm_lead"
  | "follow_up"
  | "not_interested"
  | "unsubscribe"
  | "unknown";

export async function applyAutoWorkflows(params: {
  workspaceId: string;
  contactId: string;
  intentLabel?: IntentLabel;
  eventType: "reply_received" | "lead_marked_won";
}) {
  const supabase = createClient();
  const { workspaceId, contactId, intentLabel, eventType } = params;

  const workflows = await getAutoWorkflows(workspaceId);

  // 1) Load contact + pipeline stages (for stage mapping)
  const [{ data: contact }, { data: stages }] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, lead_status, pipeline_stage_id, est_job_value, actual_job_value, owner_user_id"
      )
      .eq("id", contactId)
      .single(),
    supabase
      .from("pipeline_stages")
      .select("id, key, label")
      .eq("workspace_id", workspaceId),
  ]);

  if (!contact) return;

  // small helper: get stage by key
  function stageIdForKey(key: string): string | null {
    const s = stages?.find((st) => st.key === key);
    return s ? s.id : null;
  }

  // ==============
  // EVENT: REPLY
  // ==============
  if (eventType === "reply_received") {
    // 1) If allowed, create follow-up task (unless unsub / not interested)
    if (
      workflows.on_reply_create_task &&
      intentLabel !== "unsubscribe" &&
      intentLabel !== "not_interested"
    ) {
      const title =
        intentLabel === "hot_lead"
          ? "CALL: Hot roofing lead replied"
          : "Follow up with homeowner";

      const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow

      // Block 16300: Get default owner (contact owner or workspace owner)
      let taskOwnerId: string | null = contact.owner_user_id || null;
      if (!taskOwnerId) {
        // Fallback to workspace owner
        const { data: workspaceOwner } = await supabase
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", workspaceId)
          .eq("role", "owner")
          .limit(1)
          .single();
        taskOwnerId = workspaceOwner?.user_id || null;
      }

      const { data: task } = await supabase
        .from("tasks")
        .insert({
          workspace_id: workspaceId,
          contact_id: contact.id,
          title,
          due_at: dueAt.toISOString(),
          status: "open",
          source: "auto",
          owner_user_id: taskOwnerId, // Block 16300: Assign task to contact owner
        })
        .select("id")
        .single();

      // log in activity
      await supabase.from("contact_activity").insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        activity_type: "task_created",
        title,
        meta: { task_id: task?.id, reason: "reply_received" },
      });
    }

    // 2) If hot lead → upgrade lead_status + pipeline stage
    if (intentLabel === "hot_lead" && workflows.on_hot_lead_stage_change) {
      const newStageId =
        stageIdForKey("proposal") ||
        stageIdForKey("hot") ||
        contact.pipeline_stage_id;

      await supabase
        .from("contacts")
        .update({
          lead_status: "hot",
          pipeline_stage_id: newStageId,
        })
        .eq("id", contact.id);

      await supabase.from("contact_activity").insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        activity_type: "lead_status_changed",
        title: "Lead marked HOT (auto)",
        meta: {
          from: contact.lead_status,
          to: "hot",
          trigger: "intent_hot_lead",
        },
      });

      await supabase.from("contact_activity").insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        activity_type: "pipeline_stage_changed",
        title: "Moved to Hot/Proposal stage (auto)",
        meta: {
          new_stage_id: newStageId,
        },
      });
    }

    // 3) If warm lead → move into working stage
    if (intentLabel === "warm_lead" && workflows.on_warm_lead_stage_change) {
      const newStageId =
        stageIdForKey("qualified") ||
        stageIdForKey("working") ||
        contact.pipeline_stage_id;

      await supabase
        .from("contacts")
        .update({
          lead_status: "warm",
          pipeline_stage_id: newStageId,
        })
        .eq("id", contact.id);

      await supabase.from("contact_activity").insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        activity_type: "lead_status_changed",
        title: "Lead marked WARM (auto)",
        meta: {
          from: contact.lead_status,
          to: "warm",
          trigger: "intent_warm_lead",
        },
      });

      await supabase.from("contact_activity").insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        activity_type: "pipeline_stage_changed",
        title: "Moved to Working/Qualified stage (auto)",
        meta: {
          new_stage_id: newStageId,
        },
      });
    }
  }

  // ====================
  // EVENT: LEAD MARKED WON
  // ====================
  if (eventType === "lead_marked_won" && workflows.on_won_log_revenue) {
    // At this point you already set lead_status = 'won' and actual_job_value some amount.
    await supabase.from("contact_activity").insert({
      workspace_id: workspaceId,
      contact_id: contact.id,
      activity_type: "lead_status_changed",
      title: "Lead marked WON",
      meta: {
        value: contact.actual_job_value || contact.est_job_value || null,
      },
    });

    // You might also want to create a simple "job" record later.
  }
}

