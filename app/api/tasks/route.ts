// Block 25060 — SmartSend Roofing Task Manager v1 API
// Task CRUD operations

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    
    const workspaceId = searchParams.get("workspace_id");
    const userId = searchParams.get("user_id");
    const category = searchParams.get("category");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const jobId = searchParams.get("job_id");
    const leadId = searchParams.get("lead_id");
    const assignedUserId = searchParams.get("assigned_user_id");
    const assignedRole = searchParams.get("assigned_role");
    const overdue = searchParams.get("overdue") === "true";

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("roofing_tasks")
      .select(`
        *,
        job:roofing_jobs(id, title, job_value),
        lead:leads(id, email, first_name, last_name),
        assigned_user:profiles!roofing_tasks_assigned_user_id_fkey(id, name, email)
      `)
      .eq("workspace_id", workspaceId);

    // Apply filters
    if (category) {
      query = query.eq("category", category);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (priority) {
      query = query.eq("priority", priority);
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (leadId) {
      query = query.eq("lead_id", leadId);
    }

    if (assignedUserId) {
      query = query.eq("assigned_user_id", assignedUserId);
    }

    if (assignedRole) {
      query = query.eq("assigned_role", assignedRole);
    }

    if (overdue) {
      query = query.eq("status", "overdue");
    }

    // Order by priority and due date
    query = query
      .order("due_date", { ascending: true })
      .order("priority", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching tasks:", error);
      return NextResponse.json(
        { error: "Failed to fetch tasks" },
        { status: 500 }
      );
    }

    return NextResponse.json({ tasks: data || [] });
  } catch (error) {
    console.error("Error in GET /api/tasks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const {
      workspace_id,
      category,
      job_id,
      lead_id,
      contact_id,
      assigned_user_id,
      assigned_role,
      title,
      description,
      priority,
      due_date,
      due_time,
      creation_source,
      completion_action_type,
      completion_action_config,
      is_recurring,
      recurrence_pattern,
      recurrence_config,
      metadata,
    } = body;

    if (!workspace_id || !category || !title || !due_date) {
      return NextResponse.json(
        { error: "workspace_id, category, title, and due_date are required" },
        { status: 400 }
      );
    }

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Create task
    const { data: task, error } = await supabase
      .from("roofing_tasks")
      .insert({
        workspace_id,
        category,
        job_id: job_id || null,
        lead_id: lead_id || null,
        contact_id: contact_id || null,
        assigned_user_id: assigned_user_id || null,
        assigned_role: assigned_role || null,
        title,
        description: description || null,
        priority: priority || "medium",
        status: "open",
        due_date,
        due_time: due_time || null,
        creation_source: creation_source || "manual",
        created_by: user?.id || null,
        completion_action_type: completion_action_type || null,
        completion_action_config: completion_action_config || {},
        is_recurring: is_recurring || false,
        recurrence_pattern: recurrence_pattern || null,
        recurrence_config: recurrence_config || {},
        metadata: metadata || {},
      })
      .select(`
        *,
        job:roofing_jobs(id, title, job_value),
        lead:leads(id, email, first_name, last_name),
        assigned_user:profiles!roofing_tasks_assigned_user_id_fkey(id, name, email)
      `)
      .single();

    if (error) {
      console.error("Error creating task:", error);
      return NextResponse.json(
        { error: "Failed to create task" },
        { status: 500 }
      );
    }

    // Auto-assign task if not assigned
    if (!assigned_user_id && !assigned_role) {
      const { error: assignError } = await supabase.rpc("auto_assign_roofing_task", {
        p_task_id: task.id,
      });

      if (assignError) {
        console.error("Error auto-assigning task:", assignError);
      }
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/tasks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
