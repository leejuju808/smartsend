// Block 16200 — SmartSend Tasks & Follow-Up Board v1
// Auto-generation endpoint for tasks (can be called by cron or webhooks)

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

/**
 * POST /api/tasks/v2/auto-generate
 * Trigger auto-generation of tasks from various sources
 * 
 * Body:
 * - source: 'inbox' | 'scheduler' | 'pipeline' | 'weather' | 'list_intelligence'
 * - data: source-specific data
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // Allow service role or authenticated users
    const authHeader = req.headers.get("authorization");
    const isServiceRole = authHeader?.includes(process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20) || "");

    if (!isServiceRole && (authError || !user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { source, data } = body;

    if (!source) {
      return NextResponse.json({ error: "source is required" }, { status: 400 });
    }

    let result;

    switch (source) {
      case 'inbox':
        // Tasks are auto-created via triggers, but we can manually trigger here
        result = { message: "Inbox tasks are auto-created via database triggers" };
        break;

      case 'scheduler':
        // Call the database function to create tasks from scheduler events
        const { data: schedulerResult, error: schedulerError } = await supabase.rpc(
          'auto_create_task_from_scheduler',
          { p_appointment_id: data?.appointmentId }
        );
        if (schedulerError) {
          return NextResponse.json({ error: schedulerError.message }, { status: 500 });
        }
        result = schedulerResult;
        break;

      case 'pipeline':
        // Call the database function to create tasks from pipeline movement
        const { data: pipelineResult, error: pipelineError } = await supabase.rpc(
          'auto_create_task_from_pipeline',
          { p_contact_id: data?.contactId, p_stage_id: data?.stageId }
        );
        if (pipelineError) {
          return NextResponse.json({ error: pipelineError.message }, { status: 500 });
        }
        result = pipelineResult;
        break;

      case 'weather':
        // Create storm opportunity tasks
        if (!data?.workspaceId || !data?.contacts) {
          return NextResponse.json({ error: "workspaceId and contacts are required for weather source" }, { status: 400 });
        }
        
        const tasks = [];
        for (const contactId of data.contacts) {
          const { data: task, error: taskError } = await supabase
            .from("tasks")
            .insert({
              workspace_id: data.workspaceId,
              contact_id: contactId,
              assigned_to: data.userId || user?.id,
              task_type: 'high_urgency_issue',
              urgency: 'high',
              status: 'today',
              title: 'Storm Opportunity - High Priority',
              description: 'Storm detected in homeowner area, follow up immediately',
              due_at: new Date().toISOString(),
              auto_generated: true,
              auto_type: 'storm_opportunity',
              metadata: {
                storm_risk: 'high',
                storm_date: data.stormDate,
                weather_engine: true,
              },
            })
            .select()
            .single();

          if (!taskError && task) {
            tasks.push(task);
          }
        }
        result = { created: tasks.length, tasks };
        break;

      case 'list_intelligence':
        // Create tasks for old quotes or neighborhood lists
        if (!data?.workspaceId || !data?.contacts) {
          return NextResponse.json({ error: "workspaceId and contacts are required for list_intelligence source" }, { status: 400 });
        }

        const listTasks = [];
        for (const contactId of data.contacts) {
          const taskType = data.listType === 'old_quote' ? 'follow_up_needed' : 'update_lead_info';
          
          const { data: task, error: taskError } = await supabase
            .from("tasks")
            .insert({
              workspace_id: data.workspaceId,
              contact_id: contactId,
              assigned_to: data.userId || user?.id,
              task_type: taskType,
              urgency: data.listType === 'old_quote' ? 'normal' : 'low',
              status: 'upcoming',
              title: data.listType === 'old_quote' ? 'Revive Quote - Follow Up' : 'Geo Outreach - Update Info',
              description: data.description || `Task created from ${data.listType} list`,
              due_at: new Date(Date.now() + (data.listType === 'old_quote' ? 10 * 24 * 60 * 60 * 1000 : 3 * 24 * 60 * 60 * 1000)).toISOString(),
              auto_generated: true,
              auto_type: data.listType === 'old_quote' ? 'revive_quote' : 'geo_outreach',
              follow_up_cycle_type: data.listType === 'old_quote' ? 'old_quote' : undefined,
              metadata: {
                list_id: data.listId,
                list_type: data.listType,
              },
            })
            .select()
            .single();

          if (!taskError && task) {
            listTasks.push(task);
          }
        }
        result = { created: listTasks.length, tasks: listTasks };
        break;

      default:
        return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































