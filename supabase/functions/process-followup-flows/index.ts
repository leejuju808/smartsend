// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface Execution {
  id: string;
  flow_id: string;
  lead_id: string;
  current_node_id: string | null;
  status: string;
  next_run_at: string | null;
  context: any;
}

interface Node {
  id: string;
  flow_id: string;
  type: "wait" | "send_email" | "branch" | "action";
  label: string | null;
  config: any;
}

interface Edge {
  id: string;
  from_node_id: string;
  to_node_id: string;
  condition_key: string | null;
}

interface Lead {
  id: string;
  workspace_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

Deno.serve(async () => {
  try {
    const processed = await processFollowupFlows();
    return new Response(
      JSON.stringify({ ok: true, processed }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing follow-up flows:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

async function processFollowupFlows(): Promise<number> {
  const now = new Date().toISOString();

  // Select executions where status = 'active' AND next_run_at <= now()
  const { data: executions, error: execError } = await supabase
    .from("followup_execution")
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", now)
    .order("next_run_at", { ascending: true })
    .limit(50); // Process in batches

  if (execError) {
    console.error("Error fetching executions:", execError);
    return 0;
  }

  if (!executions || executions.length === 0) {
    return 0;
  }

  let processed = 0;

  for (const execution of executions as Execution[]) {
    try {
      await processExecution(execution);
      processed++;
    } catch (error) {
      console.error(`Error processing execution ${execution.id}:`, error);
      // Continue with next execution
    }
  }

  return processed;
}

async function processExecution(execution: Execution): Promise<void> {
  const { current_node_id, flow_id, lead_id } = execution;

  if (!current_node_id) {
    // No current node, mark as completed
    await supabase
      .from("followup_execution")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", execution.id);
    return;
  }

  // Load current node
  const { data: node, error: nodeError } = await supabase
    .from("followup_nodes")
    .select("*")
    .eq("id", current_node_id)
    .single();

  if (nodeError || !node) {
    console.error(`Node ${current_node_id} not found:`, nodeError);
    await supabase
      .from("followup_execution")
      .update({ status: "stopped", updated_at: new Date().toISOString() })
      .eq("id", execution.id);
    return;
  }

  // Load lead
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, workspace_id, email, first_name, last_name, company")
    .eq("id", lead_id)
    .single();

  if (leadError || !lead) {
    console.error(`Lead ${lead_id} not found:`, leadError);
    return;
  }

  // Execute node behavior
  let nextNodeId: string | null = null;
  let nextRunAt: string | null = null;
  let newStatus = execution.status;

  switch (node.type) {
    case "wait":
      // Wait nodes just move to next node when time is up
      // Find the next edge (should be unconditional or default)
      const { data: waitEdges } = await supabase
        .from("followup_edges")
        .select("to_node_id")
        .eq("flow_id", flow_id)
        .eq("from_node_id", current_node_id)
        .order("condition_key", { ascending: true })
        .limit(1);

      if (waitEdges && waitEdges.length > 0) {
        nextNodeId = waitEdges[0].to_node_id;
      } else {
        // No next node, mark as completed
        newStatus = "completed";
      }
      break;

    case "send_email":
      // Send email to lead
      await sendEmailToLead(lead as Lead, node.config, flow_id);
      
      // Log message sent
      await logMessageSent(lead_id, flow_id, node.id, node.config);

      // Find next edge
      const { data: emailEdges } = await supabase
        .from("followup_edges")
        .select("to_node_id")
        .eq("flow_id", flow_id)
        .eq("from_node_id", current_node_id)
        .order("condition_key", { ascending: true })
        .limit(1);

      if (emailEdges && emailEdges.length > 0) {
        nextNodeId = emailEdges[0].to_node_id;
      } else {
        newStatus = "completed";
      }
      break;

    case "branch":
      // Evaluate branch outcome
      const { data: branchResult } = await supabase.rpc("evaluate_branch_outcome", {
        p_execution_id: execution.id,
      });

      const outcome = branchResult || "no_open";

      // Find edge matching outcome
      const { data: branchEdges } = await supabase
        .from("followup_edges")
        .select("to_node_id")
        .eq("flow_id", flow_id)
        .eq("from_node_id", current_node_id)
        .eq("condition_key", outcome)
        .limit(1);

      if (branchEdges && branchEdges.length > 0) {
        nextNodeId = branchEdges[0].to_node_id;
      } else {
        // Try fallback edge
        const { data: fallbackEdges } = await supabase
          .from("followup_edges")
          .select("to_node_id")
          .eq("flow_id", flow_id)
          .eq("from_node_id", current_node_id)
          .is("condition_key", null)
          .limit(1);

        if (fallbackEdges && fallbackEdges.length > 0) {
          nextNodeId = fallbackEdges[0].to_node_id;
        } else {
          newStatus = "completed";
        }
      }
      break;

    case "action":
      // Perform actions
      await performActions(node.config.actions || [], lead as Lead, flow_id);

      // Find next edge
      const { data: actionEdges } = await supabase
        .from("followup_edges")
        .select("to_node_id")
        .eq("flow_id", flow_id)
        .eq("from_node_id", current_node_id)
        .order("condition_key", { ascending: true })
        .limit(1);

      if (actionEdges && actionEdges.length > 0) {
        nextNodeId = actionEdges[0].to_node_id;
      } else {
        newStatus = "completed";
      }
      break;
  }

  // Calculate next_run_at if we have a next node
  if (nextNodeId && newStatus === "active") {
    // Load next node to check if it's a wait node
    const { data: nextNode } = await supabase
      .from("followup_nodes")
      .select("type, config")
      .eq("id", nextNodeId)
      .single();

    if (nextNode && nextNode.type === "wait") {
      // Calculate wait time
      const { data: waitTime } = await supabase.rpc("calculate_next_run_time", {
        p_wait_config: nextNode.config,
        p_base_time: new Date().toISOString(),
      });
      nextRunAt = waitTime;
    } else {
      // Non-wait nodes execute immediately
      nextRunAt = new Date().toISOString();
    }
  }

  // Update execution
  await supabase
    .from("followup_execution")
    .update({
      current_node_id: nextNodeId,
      next_run_at: nextRunAt,
      status: newStatus,
      last_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", execution.id);
}

async function sendEmailToLead(
  lead: Lead,
  config: any,
  flowId: string
): Promise<void> {
  const templateVariantId = config.template_variant_id;
  if (!templateVariantId) {
    console.error("No template_variant_id in send_email node config");
    return;
  }

  // Load template variant
  const { data: template, error: templateError } = await supabase
    .from("template_variants")
    .select("subject, body_html, body_text")
    .eq("id", templateVariantId)
    .single();

  if (templateError || !template) {
    console.error(`Template variant ${templateVariantId} not found:`, templateError);
    return;
  }

  // Get campaign to find from_email_account_id
  const { data: flow } = await supabase
    .from("followup_flows")
    .select("campaign_id")
    .eq("id", flowId)
    .single();

  let fromEmailAccountId: string | null = null;
  if (flow?.campaign_id) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("from_email_account_id")
      .eq("id", flow.campaign_id)
      .single();
    fromEmailAccountId = campaign?.from_email_account_id || null;
  }

  // Insert into send_queue or email_logs (depending on your system)
  // Using send_queue as it's more common in this codebase
  const { error: queueError } = await supabase
    .from("send_queue")
    .insert({
      workspace_id: lead.workspace_id,
      lead_id: lead.id,
      status: "queued",
      scheduled_at: new Date().toISOString(),
      payload: {
        subject: template.subject,
        body_html: template.body_html || template.body_text,
        template_variant_id: templateVariantId,
        flow_id: flowId,
      },
    });

  if (queueError) {
    console.error("Error queueing email:", queueError);
  }
}

async function logMessageSent(
  leadId: string,
  flowId: string,
  nodeId: string,
  config: any
): Promise<void> {
  // Log to email_logs or similar tracking table
  // This depends on your logging system
  const { data: flow } = await supabase
    .from("followup_flows")
    .select("workspace_id, campaign_id")
    .eq("id", flowId)
    .single();

  if (flow) {
    await supabase.from("email_logs").insert({
      workspace_id: flow.workspace_id,
      campaign_id: flow.campaign_id || null,
      lead_id: leadId,
      subject: config.step_name || "Follow-up",
      status: "sent",
      sent_at: new Date().toISOString(),
    }).catch((err) => {
      // Ignore if table doesn't exist or has different schema
      console.log("Could not log to email_logs:", err.message);
    });
  }
}

async function performActions(
  actions: any[],
  lead: Lead,
  flowId: string
): Promise<void> {
  for (const action of actions) {
    try {
      switch (action.type) {
        case "add_tag":
          // Add tag to lead
          if (action.value) {
            // Try lead_tag_links first
            const { data: tag } = await supabase
              .from("lead_tags")
              .select("id")
              .eq("workspace_id", lead.workspace_id)
              .eq("name", action.value)
              .single();

            if (tag) {
              await supabase.from("lead_tag_links").insert({
                lead_id: lead.id,
                tag_id: tag.id,
              }).catch(() => {
                // Ignore duplicate errors
              });
            } else {
              // Create tag if it doesn't exist
              const { data: newTag } = await supabase
                .from("lead_tags")
                .insert({
                  workspace_id: lead.workspace_id,
                  name: action.value,
                })
                .select("id")
                .single();

              if (newTag) {
                await supabase.from("lead_tag_links").insert({
                  lead_id: lead.id,
                  tag_id: newTag.id,
                });
              }
            }

            // Also update tags array if column exists
            await supabase.rpc("append_tag_to_leads", {
              lead_ids: [lead.id],
              new_tag: action.value,
            }).catch(() => {
              // Ignore if function doesn't exist
            });
          }
          break;

        case "move_stage":
          // Move lead to pipeline stage
          if (action.value) {
            const { data: stage } = await supabase
              .from("crm_stages")
              .select("id")
              .eq("workspace_id", lead.workspace_id)
              .eq("name", action.value)
              .single();

            if (stage) {
              await supabase
                .from("leads")
                .update({ stage_id: stage.id })
                .eq("id", lead.id);
            }
          }
          break;

        case "create_task":
          // Create task
          const taskTitle = action.title || "Follow-up task";
          const assignTo = action.assign_to === "owner" ? null : action.assign_to;

          await supabase.from("tasks").insert({
            workspace_id: lead.workspace_id,
            lead_id: lead.id,
            title: taskTitle,
            description: action.description || null,
            assigned_to: assignTo || null,
            status: "todo",
          });
          break;

        case "assign_owner":
          // Assign lead owner
          if (action.value) {
            await supabase
              .from("leads")
              .update({ owner_id: action.value })
              .eq("id", lead.id);
          }
          break;

        case "stop":
          // Stop execution
          await supabase
            .from("followup_execution")
            .update({ status: "stopped" })
            .eq("lead_id", lead.id)
            .eq("flow_id", flowId);
          break;
      }
    } catch (error) {
      console.error(`Error executing action ${action.type}:`, error);
      // Continue with next action
    }
  }
}









