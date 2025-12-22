import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    // Verify thread exists and belongs to workspace
    const { data: thread, error: threadError } = await supabase
      .from("reply_threads")
      .select("id, workspace_id")
      .eq("id", params.threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    if (thread.workspace_id !== workspace_id) {
      return NextResponse.json(
        { error: "Thread not found in workspace" },
        { status: 403 }
      );
    }

    // Fetch notes with user information
    const { data: notes, error: notesError } = await supabase
      .from("notes")
      .select(`
        id,
        body,
        mentions,
        created_at,
        updated_at,
        user_id,
        profiles:user_id (
          email,
          full_name
        )
      `)
      .eq("thread_id", params.threadId)
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false });

    if (notesError) {
      return NextResponse.json(
        { error: notesError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ notes: notes || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch notes" },
      { status: 500 }
    );
  }
}










