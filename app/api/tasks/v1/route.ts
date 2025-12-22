import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * GET /api/tasks/v1
 * Get tasks with filtering and pagination
 * 
 * Query params:
 * - status: 'today' | 'upcoming' | 'waiting_on_homeowner' | 'completed' | 'all'
 * - task_type: 'follow_up_needed' | 'book_inspection' | 'answer_question' | 'update_lead_info' | 'high_urgency_issue'
 * - urgency: 'high' | 'normal' | 'low'
 * - assigned_to: 'me' | 'all' | userId
 * - contact_id: uuid
 * - pipeline_stage_id: uuid
 * - overdue: 'true' | 'false'
 * - limit: number (default: 100)
 * - offset: number (default: 0)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status") || "all";
    const taskType = searchParams.get("task_type");
    const urgency = searchParams.get("urgency");
    const assignedTo = searchParams.get("assigned_to") || "all";
    const contactId = searchParams.get("contact_id");
    const pipelineStageId = searchParams.get("pipeline_stage_id");
    const overdue = searchParams.get("overdue");
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Build query
    let query = supabase
      .from("smartsend_tasks")
      .select(`
        *,
        contacts (
          id,
          email,
          first_name,
          last_name,
          phone
        ),
        pipeline_stages (
          id,
          key,
          label
        )
      `)
      .eq("workspace_id", workspaceId)
      .order("due_at", { ascending: true })
      .range(offset, offset + limit - 1);

    // Filter by status
    if (status !== "all") {
      query = query.eq("status", status);
    }

    // Filter by task type
    if (taskType) {
      query = query.eq("task_type", taskType);
    }

    // Filter by urgency
    if (urgency) {
      query = query.eq("urgency", urgency);
    }

    // Filter by assignee
    if (assignedTo === "me") {
      query = query.eq("user_id", user.id);
    } else if (assignedTo !== "all") {
      query = query.eq("user_id", assignedTo);
    }

    // Filter by contact
    if (contactId) {
      query = query.eq("contact_id", contactId);
    }

    // Filter by pipeline stage
    if (pipelineStageId) {
      query = query.eq("pipeline_stage_id", pipelineStageId);
    }

    // Filter overdue tasks
    if (overdue === "true") {
      query = query.lt("due_at", new Date().toISOString()).neq("status", "completed");
    }

    const { data: tasks, error } = await query;

    if (error) {
      console.error("Error fetching tasks:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get today's tasks count
    const { count: todayCount } = await supabase
      .from("smartsend_tasks")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "today")
      .neq("status", "completed");

    return NextResponse.json({
      tasks: tasks || [],
      pagination: {
        limit,
        offset,
        total: tasks?.length || 0,
      },
      todayCount: todayCount || 0,
    });
  } catch (error) {
    console.error("Error in GET /api/tasks/v1:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/v1
 * Create a new task
 * 
 * Body:
 * {
 *   contact_id?: string;
 *   task_type: 'follow_up_needed' | 'book_inspection' | 'answer_question' | 'update_lead_info' | 'high_urgency_issue';
 *   urgency?: 'high' | 'normal' | 'low';
 *   title: string;
 *   description?: string;
 *   notes?: string;
 *   due_at: string;
 *   user_id?: string;
 *   pipeline_stage_id?: string;
 *   metadata?: object;
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await req.json();
    const {
      contact_id,
      task_type,
      urgency = "normal",
      title,
      description,
      notes,
      due_at,
      user_id,
      pipeline_stage_id,
      metadata = {},
    } = body;

    // Validate required fields
    if (!title || !task_type || !due_at) {
      return NextResponse.json(
        { error: "Missing required fields: title, task_type, due_at" },
        { status: 400 }
      );
    }

    // Determine status based on due_at
    const dueDate = new Date(due_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDateOnly = new Date(dueDate);
    dueDateOnly.setHours(0, 0, 0, 0);
    
    let status: "today" | "upcoming" | "waiting_on_homeowner" = "upcoming";
    if (dueDateOnly.getTime() === today.getTime()) {
      status = "today";
    }

    // Create task
    const { data: task, error } = await supabase
      .from("smartsend_tasks")
      .insert({
        workspace_id: workspaceId,
        user_id: user_id || user.id,
        contact_id: contact_id || null,
        task_type,
        urgency,
        status,
        title,
        description: description || null,
        notes: notes || null,
        due_at: due_at,
        pipeline_stage_id: pipeline_stage_id || null,
        metadata: metadata,
        auto_generated: false,
        created_by: user.id,
      })
      .select(`
        *,
        contacts (
          id,
          email,
          first_name,
          last_name,
          phone
        ),
        pipeline_stages (
          id,
          key,
          label
        )
      `)
      .single();

    if (error) {
      console.error("Error creating task:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/tasks/v1:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































