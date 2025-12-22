import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { status, title, description, assigned_to, due_date } = await req.json();

    if (!params.id) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Build update object
    const updates: Record<string, any> = {};
    if (status !== undefined) updates.status = status;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to;
    if (due_date !== undefined) updates.due_date = due_date;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Update task (RLS will enforce permissions)
    const { data: task, error: updateError } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating task:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    console.error("Error in update task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}










