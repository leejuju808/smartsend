// Block 21900 — SmartSend Roofing Action Queue v1
// Edge Function: Builds prioritized action queue tasks for estimators and owners
// Runs every few minutes OR on-demand to refresh tasks

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface Task {
  task_type: string;
  assigned_user_id: string | null;
  priority: number;
  due_at: string;
  source: string;
  metadata: Record<string, any>;
}

interface Lead {
  id: string;
  workspace_id: string;
  status: string;
  pipeline_stage: string;
  heat_score: number | null;
  job_probability: number | null;
  risk_category: string | null;
  risk_score: number | null;
  estimator_id: string | null;
  owner_id: string | null;
  last_activity_at: string | null;
  stage_entered_at: string | null;
  last_reply_at: string | null;
  estimated_job_value: number | null;
  created_at: string;
}

Deno.serve(async (req) => {
  try {
    const { workspace_id } = await req.json();

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing workspace_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Building action queue for workspace: ${workspace_id}`);

    // 1. Fetch active leads (not won/lost)
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select(`
        id,
        workspace_id,
        status,
        pipeline_stage,
        heat_score,
        job_probability,
        risk_category,
        risk_score,
        estimator_id,
        owner_id,
        last_activity_at,
        stage_entered_at,
        last_reply_at,
        estimated_job_value,
        created_at
      `)
      .eq("workspace_id", workspace_id)
      .not("status", "in", ["won", "lost"]);

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      return new Response(
        JSON.stringify({ error: leadsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, tasks_created: 0, message: "No active leads" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${leads.length} leads...`);

    // Get automation settings for this workspace
    const { data: settings } = await supabase
      .from("automation_settings")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    // Use defaults if settings don't exist
    const defaultSettings = {
      hot_lead_threshold: 80,
      warm_lead_threshold: 50,
      high_probability_threshold: 70,
      high_value_threshold: 10000,
      owner_only_high_value_threshold: 15000,
      max_tasks_per_estimator_daily: 15,
      include_follow_up_hot: true,
      include_follow_up_warm: true,
      include_send_proposal: true,
      include_save_critical_job: true,
      include_resurrection: true,
      include_reply_angry: true,
    };

    const effectiveSettings = settings || defaultSettings;

    const now = new Date();
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    let tasksCreated = 0;

    // Track tasks per estimator to respect daily limits
    const tasksPerEstimator = new Map<string, number>();

    // 2. Derive tasks for each lead
    for (const lead of leads) {
      const tasks = deriveTasksForLead(lead, now, inOneHour, effectiveSettings);

      for (const task of tasks) {
        // Check daily task limit per estimator
        if (task.assigned_user_id) {
          const currentCount = tasksPerEstimator.get(task.assigned_user_id) || 0;
          if (currentCount >= effectiveSettings.max_tasks_per_estimator_daily) {
            console.log(`Skipping task for estimator ${task.assigned_user_id} - daily limit reached`);
            continue;
          }
        }

        // Check if task already exists (open status)
        const { data: existingTask } = await supabase
          .from("action_queue_tasks")
          .select("id")
          .eq("lead_id", lead.id)
          .eq("task_type", task.task_type)
          .eq("assigned_user_id", task.assigned_user_id)
          .eq("status", "open")
          .maybeSingle();

        if (existingTask) {
          // Update existing task with new priority/due_at
          const { error: updateError } = await supabase
            .from("action_queue_tasks")
            .update({
              priority: task.priority,
              due_at: task.due_at,
              source: task.source,
              metadata: task.metadata,
            })
            .eq("id", existingTask.id);

          if (updateError) {
            console.error(`Error updating task for lead ${lead.id}:`, updateError);
          } else {
            tasksCreated++;
            if (task.assigned_user_id) {
              tasksPerEstimator.set(task.assigned_user_id, (tasksPerEstimator.get(task.assigned_user_id) || 0) + 1);
            }
          }
        } else {
          // Insert new task
          const { error: insertError } = await supabase
            .from("action_queue_tasks")
            .insert({
              workspace_id: lead.workspace_id,
              lead_id: lead.id,
              assigned_user_id: task.assigned_user_id,
              task_type: task.task_type,
              priority: task.priority,
              status: "open",
              due_at: task.due_at,
              source: task.source,
              metadata: task.metadata,
            });

          if (insertError) {
            console.error(`Error inserting task for lead ${lead.id}:`, insertError);
          } else {
            tasksCreated++;
            if (task.assigned_user_id) {
              tasksPerEstimator.set(task.assigned_user_id, (tasksPerEstimator.get(task.assigned_user_id) || 0) + 1);
            }
          }
        }
      }
    }

    // 3. Clean up completed/old tasks (optional - keep last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("action_queue_tasks")
      .delete()
      .eq("workspace_id", workspace_id)
      .eq("status", "done")
      .lt("completed_at", sevenDaysAgo);

    return new Response(
      JSON.stringify({
        ok: true,
        tasks_created: tasksCreated,
        leads_processed: leads.length,
        message: "Action queue built successfully",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error building action queue:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

function deriveTasksForLead(lead: Lead, now: Date, inOneHour: string, settings: any): Task[] {
  const tasks: Task[] = [];
  const estimatorId = lead.estimator_id || lead.owner_id;

  // Calculate time-based metrics
  const lastActivityHours = lead.last_activity_at
    ? Math.floor((now.getTime() - new Date(lead.last_activity_at).getTime()) / (1000 * 60 * 60))
    : null;

  const stageHours = lead.stage_entered_at
    ? Math.floor((now.getTime() - new Date(lead.stage_entered_at).getTime()) / (1000 * 60 * 60))
    : null;

  const leadAgeDays = Math.floor(
    (now.getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  const hotThreshold = settings.hot_lead_threshold ?? 80;
  const warmThreshold = settings.warm_lead_threshold ?? 50;
  const highProbThreshold = settings.high_probability_threshold ?? 70;
  const highValueThreshold = settings.high_value_threshold ?? 10000;
  const ownerOnlyThreshold = settings.owner_only_high_value_threshold ?? 15000;

  // 1. Hot lead, no recent activity → follow up hot
  if (settings.include_follow_up_hot && lead.heat_score !== null && lead.heat_score >= hotThreshold && lastActivityHours !== null && lastActivityHours >= 2) {
    tasks.push({
      task_type: "follow_up_hot",
      assigned_user_id: estimatorId,
      priority: computePriority(lead, 10),
      due_at: inOneHour,
      source: "heat_engine",
      metadata: { reason: "hot_lead_needs_followup", heat_score: lead.heat_score },
    });
  }

  // 2. Proposal not sent (estimate completed but no proposal)
  if (settings.include_send_proposal && lead.pipeline_stage === "estimate_completed" && lead.status !== "proposal_sent") {
    tasks.push({
      task_type: "send_proposal",
      assigned_user_id: estimatorId,
      priority: computePriority(lead, 5),
      due_at: inOneHour,
      source: "proposal_logic",
      metadata: { reason: "estimate_done_no_proposal", pipeline_stage: lead.pipeline_stage },
    });
  }

  // 3. Critical risk job
  if (settings.include_save_critical_job && lead.risk_category === "critical") {
    tasks.push({
      task_type: "save_critical_risk_job",
      assigned_user_id: lead.owner_id || estimatorId,
      priority: computePriority(lead, 1),
      due_at: now.toISOString(),
      source: "risk_engine",
      metadata: {
        reason: "critical_risk",
        risk_score: lead.risk_score,
        risk_category: lead.risk_category,
      },
    });
  }

  // 4. Angry homeowner (check homeowner_tone from lead_activities)
  // Note: We'll check this in a separate query if needed, but for now we'll skip
  // This would require joining with lead_activities table

  // 5. High probability but stuck in stage
  if (
    lead.job_probability !== null &&
    lead.job_probability >= highProbThreshold &&
    stageHours !== null &&
    stageHours >= 48
  ) {
    tasks.push({
      task_type: "review_stuck_job",
      assigned_user_id: lead.owner_id || estimatorId,
      priority: computePriority(lead, 8),
      due_at: inOneHour,
      source: "pipeline_board",
      metadata: {
        reason: "high_prob_stuck",
        job_probability: lead.job_probability,
        stage_hours: stageHours,
      },
    });
  }

  // 6. High value job needs owner review
  if (
    lead.estimated_job_value !== null &&
    lead.estimated_job_value >= ownerOnlyThreshold &&
    lead.owner_id &&
    lead.pipeline_stage !== "won" &&
    lead.pipeline_stage !== "lost"
  ) {
    tasks.push({
      task_type: "owner_review_high_value",
      assigned_user_id: lead.owner_id,
      priority: computePriority(lead, 6),
      due_at: inOneHour,
      source: "command_center",
      metadata: {
        reason: "high_value_job",
        estimated_job_value: lead.estimated_job_value,
      },
    });
  }

  // 7. Warm follow-up (heat score between warm and hot thresholds, no activity in 24+ hours)
  if (
    settings.include_follow_up_warm &&
    lead.heat_score !== null &&
    lead.heat_score >= warmThreshold &&
    lead.heat_score < hotThreshold &&
    lastActivityHours !== null &&
    lastActivityHours >= 24
  ) {
    tasks.push({
      task_type: "follow_up_warm",
      assigned_user_id: estimatorId,
      priority: computePriority(lead, 25),
      due_at: inOneHour,
      source: "heat_engine",
      metadata: { reason: "warm_lead_needs_followup", heat_score: lead.heat_score },
    });
  }

  // 8. Book estimate (interested but not scheduled)
  if (
    (lead.pipeline_stage === "interested" || lead.pipeline_stage === "replied") &&
    lead.pipeline_stage !== "estimate_scheduled" &&
    lead.pipeline_stage !== "estimate_completed"
  ) {
    tasks.push({
      task_type: "book_estimate",
      assigned_user_id: estimatorId,
      priority: computePriority(lead, 15),
      due_at: inOneHour,
      source: "pipeline_board",
      metadata: { reason: "interested_not_scheduled", pipeline_stage: lead.pipeline_stage },
    });
  }

  // 9. Resurrection follow-up (old lead, no activity in cooldown days, not won/lost)
  const resurrectionCooldownDays = settings.resurrection_cooldown_days ?? 30;
  if (
    settings.include_resurrection &&
    leadAgeDays >= resurrectionCooldownDays &&
    (lastActivityHours === null || lastActivityHours >= 24 * resurrectionCooldownDays) &&
    lead.pipeline_stage !== "won" &&
    lead.pipeline_stage !== "lost"
  ) {
    tasks.push({
      task_type: "resurrection_follow_up",
      assigned_user_id: estimatorId,
      priority: computePriority(lead, 40),
      due_at: inOneHour,
      source: "resurrection_engine",
      metadata: {
        reason: "ghosted_or_past_customer",
        lead_age_days: leadAgeDays,
        last_activity_hours: lastActivityHours,
      },
    });
  }

  return tasks;
}

function computePriority(lead: Lead, base: number): number {
  let p = base;

  // Lower priority number = higher priority
  // Subtract points for high heat score
  if (lead.heat_score !== null) {
    p -= Math.floor(lead.heat_score / 20);
  }

  // Subtract points for high job probability
  if (lead.job_probability !== null) {
    p -= Math.floor(lead.job_probability / 25);
  }

  // Critical risk gets highest priority
  if (lead.risk_category === "critical") {
    p = Math.min(p, 2);
  } else if (lead.risk_category === "high") {
    p = Math.min(p, 5);
  } else if (lead.risk_category === "medium") {
    p = Math.min(p, 10);
  }

  // High value jobs get priority boost
  if (lead.estimated_job_value !== null && lead.estimated_job_value >= 10000) {
    p -= 3;
  }

  // Ensure priority stays within bounds
  if (p < 1) p = 1;
  if (p > 100) p = 100;

  return p;
}

