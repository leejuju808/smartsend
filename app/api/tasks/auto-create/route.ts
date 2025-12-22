// Block 25060 — SmartSend Roofing Task Manager v1 API
// Automatic task creation endpoints

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Create task from message
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const { type, ...params } = body;

    let taskId: string | null = null;

    switch (type) {
      case "message":
        const {
          workspace_id,
          message_id,
          contact_id,
          job_id,
          lead_id,
          message_text,
          nlp_intent,
        } = params;

        if (!workspace_id || !message_id || !message_text) {
          return NextResponse.json(
            { error: "workspace_id, message_id, and message_text are required" },
            { status: 400 }
          );
        }

        const { data: messageTask, error: messageError } = await supabase.rpc(
          "create_task_from_message",
          {
            p_workspace_id: workspace_id,
            p_message_id: message_id,
            p_contact_id: contact_id || null,
            p_job_id: job_id || null,
            p_lead_id: lead_id || null,
            p_message_text: message_text,
            p_nlp_intent: nlp_intent || null,
          }
        );

        if (messageError) {
          console.error("Error creating task from message:", messageError);
          return NextResponse.json(
            { error: "Failed to create task from message" },
            { status: 500 }
          );
        }

        taskId = messageTask;
        break;

      case "alert":
        const {
          workspace_id: alertWorkspaceId,
          alert_id,
          alert_type,
          alert_title,
          alert_message,
          job_id: alertJobId,
          lead_id: alertLeadId,
          contact_id: alertContactId,
        } = params;

        if (!alertWorkspaceId || !alert_id || !alert_type || !alert_title) {
          return NextResponse.json(
            { error: "workspace_id, alert_id, alert_type, and alert_title are required" },
            { status: 400 }
          );
        }

        const { data: alertTask, error: alertError } = await supabase.rpc(
          "create_task_from_alert",
          {
            p_workspace_id: alertWorkspaceId,
            p_alert_id: alert_id,
            p_alert_type: alert_type,
            p_alert_title: alert_title,
            p_alert_message: alert_message || "",
            p_job_id: alertJobId || null,
            p_lead_id: alertLeadId || null,
            p_contact_id: alertContactId || null,
          }
        );

        if (alertError) {
          console.error("Error creating task from alert:", alertError);
          return NextResponse.json(
            { error: "Failed to create task from alert" },
            { status: 500 }
          );
        }

        taskId = alertTask;
        break;

      case "pipeline":
        const {
          workspace_id: pipelineWorkspaceId,
          job_id: pipelineJobId,
          lead_id: pipelineLeadId,
          pipeline_stage,
          change_type,
        } = params;

        if (!pipelineWorkspaceId || !pipeline_stage || !change_type) {
          return NextResponse.json(
            { error: "workspace_id, pipeline_stage, and change_type are required" },
            { status: 400 }
          );
        }

        const { data: pipelineTask, error: pipelineError } = await supabase.rpc(
          "create_task_from_pipeline_change",
          {
            p_workspace_id: pipelineWorkspaceId,
            p_job_id: pipelineJobId || null,
            p_lead_id: pipelineLeadId || null,
            p_pipeline_stage: pipeline_stage,
            p_change_type: change_type,
          }
        );

        if (pipelineError) {
          console.error("Error creating task from pipeline:", pipelineError);
          return NextResponse.json(
            { error: "Failed to create task from pipeline change" },
            { status: 500 }
          );
        }

        taskId = pipelineTask;
        break;

      default:
        return NextResponse.json(
          { error: "Invalid type. Must be 'message', 'alert', or 'pipeline'" },
          { status: 400 }
        );
    }

    // Fetch created task
    const { data: task, error: fetchError } = await supabase
      .from("roofing_tasks")
      .select(`
        *,
        job:roofing_jobs(id, title, job_value),
        lead:leads(id, email, first_name, last_name),
        assigned_user:profiles!roofing_tasks_assigned_user_id_fkey(id, name, email)
      `)
      .eq("id", taskId)
      .single();

    if (fetchError) {
      console.error("Error fetching created task:", fetchError);
      return NextResponse.json(
        { error: "Task created but failed to fetch" },
        { status: 500 }
      );
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/tasks/auto-create:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}






































