import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { status } = body;

    if (status !== "completed") {
      return NextResponse.json(
        { error: "Invalid status. Only 'completed' is supported." },
        { status: 400 }
      );
    }

    const { data: task, error } = await supabase
      .from("tasks")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating task:", error);
      return NextResponse.json(
        { error: "Failed to update task", details: error.message },
        { status: 400 }
      );
    }

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, task });
  } catch (error: any) {
    console.error("Today task update API error:", error);
    return NextResponse.json(
      { error: "Failed to update task", details: error.message },
      { status: 500 }
    );
  }
}














































