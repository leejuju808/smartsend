// POST /api/inbox/tasks - Auto-create task from message

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const body = await req.json();

  const { thread_id, message_id, lead_id, description, due_at, task_type } = body;

  if (!lead_id || !description) {
    return NextResponse.json(
      { error: "lead_id and description are required" },
      { status: 400 }
    );
  }

  try {
    const { data: task, error } = await supabaseAdmin
      .from("inbox_tasks")
      .insert({
        workspace_id,
        thread_id: thread_id || null,
        message_id: message_id || null,
        lead_id,
        description,
        due_at: due_at || null,
        task_type: task_type || null,
        completed: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating task:", error);
      return NextResponse.json(
        { error: "Failed to create task" },
        { status: 500 }
      );
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Error in create task API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
