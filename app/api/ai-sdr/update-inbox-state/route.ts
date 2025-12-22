import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { thread_id, state } = await req.json();

    if (!thread_id || !state) {
      return NextResponse.json(
        { error: "thread_id and state are required" },
        { status: 400 }
      );
    }

    // Validate state
    const validStates = ["active", "archived", "muted", "dismissed"];
    if (!validStates.includes(state)) {
      return NextResponse.json(
        { error: "Invalid state. Must be one of: active, archived, muted, dismissed" },
        { status: 400 }
      );
    }

    // Update the thread's inbox state
    const { error: updateError } = await supabase
      .from("ai_sdr_threads")
      .update({
        inbox_state: state,
        inbox_state_reason: "Manual override",
        inbox_state_updated_at: new Date().toISOString(),
      })
      .eq("id", thread_id);

    if (updateError) {
      console.error("Error updating inbox state:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to update inbox state" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in update-inbox-state route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


