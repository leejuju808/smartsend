// Block 22112 — SmartSend Roofing Action Queue v2
// Edge Function: Generate Action Queue Tasks
// Triggered every intelligence update (health, momentum, experience, risk, etc.)
//
// This function analyzes lead intelligence and generates prioritized tasks
// for the Action Queue v2 Daily Command Center.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  // Allow POST requests only
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { lead_id, workspace_id } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Pull full intelligence snapshot
    const { data: lead, error: viewError } = await supabase
      .from("lead_full_intelligence_view")
      .select("*")
      .eq("lead_id", lead_id)
      .single();

    if (viewError || !lead) {
      console.error("Error fetching lead intelligence:", viewError);
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get workspace_id if not provided
    const targetWorkspaceId = workspace_id || lead.workspace_id;
    if (!targetWorkspaceId) {
      return new Response(
        JSON.stringify({ error: "Workspace ID required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build task list based on signals
    const tasks: any[] = [];

    // ============================================================================
    // PRIORITY 1: HIGH — Revenue Urgent
    // ============================================================================

    // 1. Job Save active
    if (lead.has_active_save) {
      const severity = lead.save_severity || "high";
      tasks.push({
        lead_id: lead_id,
        workspace_id: targetWorkspaceId,
        assigned_user_id: lead.owner_id,
        task_type: "job_save",
        action_priority: 1,
        action_category: "save",
        next_action: "recovery_message",
        next_action_reason: `Job save required - ${severity} severity. ${lead.save_severity === "critical" ? "Immediate action needed." : "Action needed to prevent job loss."}`,
        due_at: new Date().toISOString(),
        auto_generated: true,
        priority: 1, // Legacy priority
        source: "job_save_engine",
        metadata: {
          save_severity: severity,
          reason: "Active job save event detected",
        },
      });
    }

    // 2. Follow-up overdue (> 24 hours)
    // Convert days to hours
    const hoursSinceLastReply = lead.days_since_last_reply ? lead.days_since_last_reply * 24 : null;
    const hoursSinceLastMessage = lead.days_since_last_message ? lead.days_since_last_message * 24 : null;
    
    if (hoursSinceLastReply && hoursSinceLastReply > 24) {
      tasks.push({
        lead_id: lead_id,
        workspace_id: targetWorkspaceId,
        assigned_user_id: lead.owner_id,
        task_type: "overdue_follow_up",
        action_priority: 1,
        action_category: "communication",
        next_action: "send_followup",
        next_action_reason: `Follow-up overdue by ${Math.round(hoursSinceLastReply - 24)} hours. Homeowner may be losing interest.`,
        due_at: new Date().toISOString(),
        auto_generated: true,
        priority: 1,
        source: "intelligence_engine",
        metadata: {
          hours_overdue: Math.round(hoursSinceLastReply - 24),
          last_reply_at: lead.last_reply_at,
        },
      });
    }

    // 3. Proposal delay (> 12 hours)
    let proposalDelayHours: number | null = null;
    if (lead.has_proposal && lead.last_proposal_at) {
      const proposalTime = new Date(lead.last_proposal_at).getTime();
      const now = Date.now();
      proposalDelayHours = (now - proposalTime) / (1000 * 60 * 60); // Convert to hours
    }
    
    if (lead.has_proposal && proposalDelayHours && proposalDelayHours > 12) {
      tasks.push({
        lead_id: lead_id,
        workspace_id: targetWorkspaceId,
        assigned_user_id: lead.owner_id,
        task_type: "proposal_overdue",
        action_priority: 1,
        action_category: "proposal",
        next_action: "send_proposal_now",
        next_action_reason: `Proposal sent ${Math.round(proposalDelayHours)} hours ago with no response. Follow up immediately.`,
        due_at: new Date().toISOString(),
        auto_generated: true,
        priority: 1,
        source: "intelligence_engine",
        metadata: {
          proposal_delay_hours: Math.round(proposalDelayHours),
          last_proposal_at: lead.last_proposal_at,
        },
      });
    }

    // 4. Tone frustration detected
    if (lead.homeowner_tone === "frustrated" || lead.homeowner_tone === "angry") {
      tasks.push({
        lead_id: lead_id,
        workspace_id: targetWorkspaceId,
        assigned_user_id: lead.owner_id,
        task_type: "tone_reset",
        action_priority: 1,
        action_category: "communication",
        next_action: "send_tone_reset",
        next_action_reason: "Frustration detected in homeowner tone. Immediate tone reset required to rebuild trust.",
        due_at: new Date().toISOString(),
        auto_generated: true,
        priority: 1,
        source: "intelligence_engine",
        metadata: {
          tone: lead.homeowner_tone,
          experience_score: lead.homeowner_experience_score,
        },
      });
    }

    // 5. High risk + declining momentum
    if (lead.risk_category === "high" || lead.risk_category === "critical") {
      if (lead.momentum_trend === "declining" || (lead.momentum_score && lead.momentum_score < 30)) {
        tasks.push({
          lead_id: lead_id,
          workspace_id: targetWorkspaceId,
          assigned_user_id: lead.owner_id,
          task_type: "urgent_recovery_message",
          action_priority: 1,
          action_category: "save",
          next_action: "recovery_message",
          next_action_reason: `High risk job (${lead.risk_category}) with declining momentum. Urgent recovery action needed.`,
          due_at: new Date().toISOString(),
          auto_generated: true,
          priority: 1,
          source: "risk_engine",
          metadata: {
            risk_category: lead.risk_category,
            risk_score: lead.risk_score,
            momentum_score: lead.momentum_score,
            momentum_trend: lead.momentum_trend,
          },
        });
      }
    }

    // 6. Next action = "call_now"
    if (lead.next_action === "call_now") {
      tasks.push({
        lead_id: lead_id,
        workspace_id: targetWorkspaceId,
        assigned_user_id: lead.owner_id,
        task_type: "call_homeowner",
        action_priority: 1,
        action_category: "communication",
        next_action: "call_now",
        next_action_reason: lead.next_action_reason || "AI recommends immediate call to move job forward.",
        due_at: new Date().toISOString(),
        auto_generated: true,
        priority: 1,
        source: "next_action_engine",
        metadata: {
          ai_recommended: true,
          reason: lead.next_action_reason,
        },
      });
    }

    // ============================================================================
    // PRIORITY 2: MEDIUM — Move the Job Forward
    // ============================================================================

    // 7. Ghosting (no reply for 48+ hours)
    // Use hoursSinceLastReply if available, otherwise use hoursSinceLastMessage
    const hoursSinceContact = hoursSinceLastReply || hoursSinceLastMessage;
    if (hoursSinceContact && hoursSinceContact >= 48) {
      tasks.push({
        lead_id: lead_id,
        workspace_id: targetWorkspaceId,
        assigned_user_id: lead.owner_id,
        task_type: "soft_reengagement",
        action_priority: 2,
        action_category: "communication",
        next_action: "send_soft_reengagement",
        next_action_reason: `No reply for ${Math.round(hoursSinceContact)} hours. Soft re-engagement needed.`,
        due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // Due in 2 hours
        auto_generated: true,
        priority: 30,
        source: "intelligence_engine",
        metadata: {
          hours_since_reply: Math.round(hoursSinceContact),
        },
      });
    }

    // 8. Proposal pending (not sent yet)
    if (!lead.has_proposal && lead.pipeline_stage && 
        (lead.pipeline_stage.includes("estimate") || lead.pipeline_stage.includes("proposal"))) {
      tasks.push({
        lead_id: lead_id,
        workspace_id: targetWorkspaceId,
        assigned_user_id: lead.owner_id,
        task_type: "send_proposal",
        action_priority: 2,
        action_category: "proposal",
        next_action: "send_proposal_now",
        next_action_reason: "Job is ready for proposal. Send proposal to move forward.",
        due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // Due in 4 hours
        auto_generated: true,
        priority: 25,
        source: "pipeline_engine",
        metadata: {
          pipeline_stage: lead.pipeline_stage,
        },
      });
    }

    // 9. Inspection scheduling needed
    if (!lead.has_inspection && lead.pipeline_stage && 
        lead.pipeline_stage.includes("lead") && lead.momentum_score && lead.momentum_score > 60) {
      tasks.push({
        lead_id: lead_id,
        workspace_id: targetWorkspaceId,
        assigned_user_id: lead.owner_id,
        task_type: "schedule_inspection",
        action_priority: 2,
        action_category: "inspection",
        next_action: "schedule_inspection",
        next_action_reason: "High momentum job ready for inspection scheduling.",
        due_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // Due in 6 hours
        auto_generated: true,
        priority: 30,
        source: "pipeline_engine",
        metadata: {
          momentum_score: lead.momentum_score,
          pipeline_stage: lead.pipeline_stage,
        },
      });
    }

    // 10. Stage advancement opportunity
    if (lead.job_probability && lead.job_probability > 70 && 
        lead.momentum_score && lead.momentum_score > 65) {
      tasks.push({
        lead_id: lead_id,
        workspace_id: targetWorkspaceId,
        assigned_user_id: lead.owner_id,
        task_type: "move_job_to_next_stage",
        action_priority: 2,
        action_category: "stage",
        next_action: lead.next_action || "send_followup",
        next_action_reason: "High probability job with strong momentum. Ready to advance to next stage.",
        due_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // Due in 8 hours
        auto_generated: true,
        priority: 35,
        source: "pipeline_engine",
        metadata: {
          job_probability: lead.job_probability,
          momentum_score: lead.momentum_score,
          current_stage: lead.pipeline_stage,
        },
      });
    }

    // ============================================================================
    // PRIORITY 3: LOW — Clean Up & Prep
    // ============================================================================

    // 11. Regular follow-up (not overdue, but time for check-in)
    const hoursForFollowup = hoursSinceLastReply || hoursSinceLastMessage;
    if (hoursForFollowup && hoursForFollowup >= 12 && hoursForFollowup < 24) {
      tasks.push({
        lead_id: lead_id,
        workspace_id: targetWorkspaceId,
        assigned_user_id: lead.owner_id,
        task_type: "follow_up_warm",
        action_priority: 3,
        action_category: "communication",
        next_action: "send_followup",
        next_action_reason: "Time for regular follow-up to maintain engagement.",
        due_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // Due in 12 hours
        auto_generated: true,
        priority: 50,
        source: "intelligence_engine",
        metadata: {
          hours_since_reply: Math.round(hoursForFollowup),
        },
      });
    }

    // 12. Photo request (if needed)
    if (lead.pipeline_stage && lead.pipeline_stage.includes("lead") && 
        !lead.has_inspection && lead.momentum_score && lead.momentum_score > 50) {
      tasks.push({
        lead_id: lead_id,
        workspace_id: targetWorkspaceId,
        assigned_user_id: lead.owner_id,
        task_type: "photo_request",
        action_priority: 3,
        action_category: "communication",
        next_action: "request_photos",
        next_action_reason: "Request photos to better assess the job.",
        due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Due in 24 hours
        auto_generated: true,
        priority: 60,
        source: "intelligence_engine",
        metadata: {
          pipeline_stage: lead.pipeline_stage,
        },
      });
    }

    // ============================================================================
    // SAVE TASKS TO DATABASE
    // ============================================================================

    // Delete existing open tasks for this lead (to avoid duplicates)
    await supabase
      .from("action_queue_tasks")
      .delete()
      .eq("lead_id", lead_id)
      .eq("status", "open")
      .eq("auto_generated", true);

    // Insert new tasks
    if (tasks.length > 0) {
      const { error: insertError } = await supabase
        .from("action_queue_tasks")
        .insert(tasks);

      if (insertError) {
        console.error("Error inserting tasks:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to create tasks", details: insertError.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        lead_id: lead_id,
        tasks_created: tasks.length,
        tasks: tasks.map(t => ({
          task_type: t.task_type,
          action_priority: t.action_priority,
          action_category: t.action_category,
          next_action: t.next_action,
        })),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in generate-action-queue:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

