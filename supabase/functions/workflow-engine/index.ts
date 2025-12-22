// Block 25020 — SmartSend Roofing Workflow Builder v1
// Edge Function: /workflow-engine
// 
// This is the central worker that processes workflow events.
// Pattern: Polls workflow_events table, matches to workflows, evaluates conditions, executes actions.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1️⃣ Fetch unprocessed events (limit to prevent overload)
    const { data: events, error: eventsError } = await supabase
      .from("workflow_events")
      .select("*")
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(50);

    if (eventsError) throw eventsError;
    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "no events" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    for (const event of events) {
      const {
        id: eventId,
        workspace_id,
        event_type,
        resource_type,
        resource_id,
        payload,
      } = event;

      // 2️⃣ Get active workflows for this workspace + event type
      const { data: workflows, error: workflowError } = await supabase
        .from("workflows")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("trigger_type", event_type)
        .eq("is_active", true);

      if (workflowError) throw workflowError;

      for (const workflow of workflows || []) {
        // Check rate limiting
        if (workflow.max_executions_per_day) {
          const today = new Date().toISOString().split("T")[0];
          const { count } = await supabase
            .from("workflow_executions")
            .select("*", { count: "exact", head: true })
            .eq("workflow_id", workflow.id)
            .eq("status", "success")
            .gte("created_at", `${today}T00:00:00Z`);

          if ((count || 0) >= workflow.max_executions_per_day) {
            console.log(
              `Workflow ${workflow.id} hit rate limit (${workflow.max_executions_per_day}/day)`
            );
            continue;
          }
        }

        // Create execution record
        const { data: execution, error: execError } = await supabase
          .from("workflow_executions")
          .insert({
            workspace_id,
            workflow_id: workflow.id,
            trigger_type: event_type,
            trigger_resource_type: resource_type,
            trigger_resource_id: resource_id,
            status: "pending",
          })
          .select()
          .single();

        if (execError) {
          console.error("Error creating execution:", execError);
          continue;
        }

        try {
          // 3️⃣ Enrich payload with additional context
          const enrichedPayload = await enrichPayload(
            resource_type,
            resource_id,
            payload,
            workspace_id
          );

          // 4️⃣ Evaluate conditions
          const { data: conditionResult, error: conditionError } =
            await supabase.rpc("evaluate_workflow_conditions", {
              p_conditions: workflow.conditions || [],
              p_payload: enrichedPayload,
            });

          if (conditionError) throw conditionError;

          const conditionsPassed = conditionResult === true;

          // Update execution with condition result
          await supabase
            .from("workflow_executions")
            .update({
              conditions_passed: conditionsPassed,
              condition_details: { result: conditionsPassed },
              status: conditionsPassed ? "running" : "skipped",
            })
            .eq("id", execution.id);

          if (!conditionsPassed) {
            console.log(
              `Workflow ${workflow.id} conditions not met, skipping`
            );
            continue;
          }

          // 5️⃣ Apply execution delay if configured
          if (workflow.execution_delay_seconds > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, workflow.execution_delay_seconds * 1000)
            );
          }

          // 6️⃣ Execute actions
          const actionsExecuted: any[] = [];
          const actionsFailed: any[] = [];

          for (const action of workflow.actions || []) {
            try {
              const result = await executeAction(
                action,
                enrichedPayload,
                workspace_id,
                resource_type,
                resource_id
              );
              actionsExecuted.push({
                action,
                result,
                executed_at: new Date().toISOString(),
              });
            } catch (err: any) {
              console.error("Action execution error:", err);
              actionsFailed.push({
                action,
                error: err.message,
                failed_at: new Date().toISOString(),
              });
            }
          }

          // 7️⃣ Update execution with results
          await supabase
            .from("workflow_executions")
            .update({
              status: actionsFailed.length === 0 ? "success" : "error",
              actions_executed: actionsExecuted,
              actions_failed: actionsFailed,
              completed_at: new Date().toISOString(),
            })
            .eq("id", execution.id);
        } catch (err: any) {
          console.error("Workflow execution error:", err);
          await supabase
            .from("workflow_executions")
            .update({
              status: "error",
              error_message: String(err?.message || err),
              completed_at: new Date().toISOString(),
            })
            .eq("id", execution.id);
        }
      }

      // 8️⃣ Mark event processed
      await supabase
        .from("workflow_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", eventId);
    }

    return new Response(
      JSON.stringify({ ok: true, processed: events.length }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Enrich payload with additional context from database
async function enrichPayload(
  resourceType: string,
  resourceId: string,
  payload: any,
  workspaceId: string
): Promise<any> {
  const enriched = { ...payload };

  try {
    if (resourceType === "lead" && resourceId) {
      const { data: lead } = await supabase
        .from("leads")
        .select("*")
        .eq("id", resourceId)
        .single();
      if (lead) {
        enriched.lead = lead;
        enriched.homeowner = {
          zip: lead.zip,
          city: lead.city,
          state: lead.state,
          email: lead.email,
          phone: lead.phone,
        };
      }
    }

    if (resourceType === "job" && resourceId) {
      const { data: job } = await supabase
        .from("roofing_jobs")
        .select("*")
        .eq("id", resourceId)
        .single();
      if (job) {
        enriched.job = job;

        // Get related lead
        if (job.lead_id) {
          const { data: lead } = await supabase
            .from("leads")
            .select("*")
            .eq("id", job.lead_id)
            .single();
          if (lead) {
            enriched.homeowner = {
              zip: lead.zip,
              city: lead.city,
              state: lead.state,
              email: lead.email,
              phone: lead.phone,
            };
          }
        }

        // Get payments
        const { data: payments } = await supabase
          .from("job_payments")
          .select("*")
          .eq("job_id", resourceId);
        enriched.payments = payments || [];

        // Get invoices
        const { data: invoices } = await supabase
          .from("job_invoices")
          .select("*")
          .eq("job_id", resourceId);
        enriched.invoices = invoices || [];

        // Calculate days overdue for invoices
        if (invoices && invoices.length > 0) {
          const now = new Date();
          enriched.invoices = invoices.map((inv: any) => {
            if (inv.due_date && inv.status === "sent") {
              const dueDate = new Date(inv.due_date);
              const daysOverdue = Math.floor(
                (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
              );
              return { ...inv, days_overdue: Math.max(0, daysOverdue) };
            }
            return inv;
          });
        }
      }
    }

    if (resourceType === "proposal" && resourceId) {
      const { data: proposal } = await supabase
        .from("proposals")
        .select("*")
        .eq("id", resourceId)
        .single();
      if (proposal) {
        enriched.proposal = proposal;
      }
    }

    if (resourceType === "payment" && resourceId) {
      const { data: payment } = await supabase
        .from("job_payments")
        .select("*")
        .eq("id", resourceId)
        .single();
      if (payment) {
        enriched.payment = payment;
      }
    }

    if (resourceType === "invoice" && resourceId) {
      const { data: invoice } = await supabase
        .from("job_invoices")
        .select("*")
        .eq("id", resourceId)
        .single();
      if (invoice) {
        enriched.invoice = invoice;

        // Calculate days overdue
        if (invoice.due_date && invoice.status === "sent") {
          const now = new Date();
          const dueDate = new Date(invoice.due_date);
          const daysOverdue = Math.floor(
            (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          enriched.invoice.days_overdue = Math.max(0, daysOverdue);
        }
      }
    }

    // Add weekday
    enriched.weekday = new Date().toLocaleDateString("en-US", {
      weekday: "long",
    });
  } catch (err) {
    console.error("Error enriching payload:", err);
  }

  return enriched;
}

// Action executor
async function executeAction(
  action: any,
  payload: any,
  workspaceId: string,
  resourceType: string,
  resourceId: string
): Promise<any> {
  const type = action.type;

  switch (type) {
    case "send_message": {
      // Send email/SMS message using template
      const template = action.template || "default";
      const channel = action.channel || "email";
      const recipient = payload.homeowner?.email || payload.lead?.email;

      if (!recipient) {
        throw new Error("No recipient email found");
      }

      // TODO: Integrate with actual email/SMS sending service
      // For now, log the action
      console.log(`Would send ${channel} message`, {
        template,
        recipient,
        payload: action.payload || {},
      });

      // Create a task or notification to track this
      await supabase.from("tasks").insert({
        workspace_id: workspaceId,
        title: `Send ${template} message to ${recipient}`,
        description: `Workflow action: ${action.type}`,
        status: "pending",
      });

      return { sent: true, channel, template, recipient };
    }

    case "assign_owner": {
      const userId = action.user_id;
      if (resourceType === "lead" && resourceId) {
        await supabase
          .from("leads")
          .update({ owner_id: userId })
          .eq("id", resourceId);
      }
      return { assigned: true, user_id: userId };
    }

    case "assign_sales_rep": {
      const userId = action.user_id;
      if (resourceType === "lead" && resourceId) {
        await supabase
          .from("leads")
          .update({ assigned_to: userId })
          .eq("id", resourceId);
      }
      return { assigned: true, user_id: userId };
    }

    case "schedule_inspection": {
      const delayDays = action.delay_days || 0;
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + delayDays);

      // TODO: Create actual inspection/calendar event
      console.log(`Would schedule inspection for ${scheduledDate}`);

      await supabase.from("tasks").insert({
        workspace_id: workspaceId,
        title: "Schedule inspection",
        description: `Workflow action: schedule inspection`,
        due_date: scheduledDate.toISOString(),
        status: "pending",
      });

      return { scheduled: true, date: scheduledDate.toISOString() };
    }

    case "notify_crew": {
      const message = action.message || "Workflow notification";
      // TODO: Integrate with crew notification system
      console.log(`Would notify crew: ${message}`);
      return { notified: true, message };
    }

    case "create_task": {
      const title = action.title || "Workflow task";
      const assignee = action.assignee || null;
      const priority = action.priority || "normal";

      const { data: task } = await supabase
        .from("tasks")
        .insert({
          workspace_id: workspaceId,
          title,
          description: action.description || "",
          assigned_to: assignee,
          priority,
          status: "pending",
        })
        .select()
        .single();

      return { task_created: true, task_id: task?.id };
    }

    case "change_job_stage": {
      const stage = action.stage;
      if (resourceType === "job" && resourceId) {
        await supabase
          .from("roofing_jobs")
          .update({ status: stage })
          .eq("id", resourceId);
      }
      return { stage_changed: true, stage };
    }

    case "trigger_sequence": {
      const sequenceId = action.sequence_id;
      // TODO: Integrate with sequence system
      console.log(`Would trigger sequence: ${sequenceId}`);
      return { sequence_triggered: true, sequence_id: sequenceId };
    }

    case "block_scheduling": {
      const reason = action.reason || "Workflow block";
      if (resourceType === "job" && resourceId) {
        await supabase
          .from("roofing_jobs")
          .update({
            notes: `SCHEDULING BLOCKED: ${reason}`,
            status: "unscheduled",
          })
          .eq("id", resourceId);
      }
      return { blocked: true, reason };
    }

    case "escalate_to_owner": {
      const priority = action.priority || "normal";
      const message = action.message || "Workflow escalation";

      // Create high-priority task for owner
      await supabase.from("tasks").insert({
        workspace_id: workspaceId,
        title: `ESCALATION: ${message}`,
        description: `Workflow escalation from ${resourceType}`,
        priority: "urgent",
        status: "pending",
      });

      // TODO: Send notification to owner
      console.log(`Would escalate to owner: ${message}`);

      return { escalated: true, priority, message };
    }

    case "update_health_score": {
      const score = action.score;
      if (resourceType === "job" && resourceId) {
        // Assuming there's a health_score column
        await supabase
          .from("roofing_jobs")
          .update({ health_score: score })
          .eq("id", resourceId);
      }
      return { score_updated: true, score };
    }

    case "log_timeline_event": {
      const eventType = action.event_type || "workflow_action";
      const message = action.message || "Workflow action executed";

      if (resourceType === "lead" && resourceId) {
        await supabase.from("lead_timeline_events").insert({
          lead_id: resourceId,
          event_type: eventType,
          message: message,
          metadata: { workflow_action: action },
        });
      }

      if (resourceType === "job" && resourceId) {
        await supabase.from("job_events").insert({
          job_id: resourceId,
          workspace_id: workspaceId,
          event_type: eventType,
          metadata: { workflow_action: action, message },
        });
      }

      return { logged: true, event_type: eventType };
    }

    case "notify_owner": {
      const message = action.message || "Workflow notification";
      // TODO: Send notification to workspace owner
      console.log(`Would notify owner: ${message}`);
      return { notified: true, message };
    }

    case "notify_operations": {
      const message = action.message || "Workflow notification";
      // TODO: Send notification to operations team
      console.log(`Would notify operations: ${message}`);
      return { notified: true, message };
    }

    case "notify_sales_rep": {
      const message = action.message || "Workflow notification";
      // TODO: Send notification to sales rep
      console.log(`Would notify sales rep: ${message}`);
      return { notified: true, message };
    }

    case "create_calendar_event": {
      const title = action.title || "Workflow event";
      // TODO: Create calendar event
      console.log(`Would create calendar event: ${title}`);
      return { created: true, title };
    }

    default:
      console.warn(`Unknown action type: ${type}`);
      return { skipped: true, reason: "unknown_action_type" };
  }
}






































