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

    // Fetch all timeline items
    const [notesResult, tasksResult, eventsResult, messagesResult] = await Promise.all([
      // Notes
      supabase
        .from("notes")
        .select(`
          id,
          body,
          created_at,
          user_id,
          profiles:user_id (
            email,
            full_name
          )
        `)
        .eq("thread_id", params.threadId)
        .eq("workspace_id", workspace_id)
        .order("created_at", { ascending: false }),

      // Tasks
      supabase
        .from("tasks")
        .select(`
          id,
          title,
          status,
          created_at,
          created_by,
          assigned_to,
          created_by_profile:created_by (
            email,
            full_name
          ),
          assigned_to_profile:assigned_to (
            email,
            full_name
          )
        `)
        .eq("thread_id", params.threadId)
        .eq("workspace_id", workspace_id)
        .order("created_at", { ascending: false }),

      // System events
      supabase
        .from("system_events")
        .select("id, type, metadata, created_at")
        .eq("thread_id", params.threadId)
        .eq("workspace_id", workspace_id)
        .order("created_at", { ascending: false }),

      // Reply messages
      supabase
        .from("reply_messages")
        .select("id, direction, snippet, created_at, sender_email")
        .eq("thread_id", params.threadId)
        .eq("workspace_id", workspace_id)
        .order("created_at", { ascending: false }),
    ]);

    // Combine and format timeline items
    const timelineItems: any[] = [];

    // Add notes
    if (notesResult.data) {
      notesResult.data.forEach((note: any) => {
        timelineItems.push({
          id: note.id,
          type: "note",
          created_at: note.created_at,
          data: {
            body: note.body,
            user: note.profiles
              ? note.profiles.full_name || note.profiles.email
              : "Unknown",
          },
        });
      });
    }

    // Add tasks
    if (tasksResult.data) {
      tasksResult.data.forEach((task: any) => {
        timelineItems.push({
          id: task.id,
          type: "task",
          created_at: task.created_at,
          data: {
            title: task.title,
            status: task.status,
            created_by: task.created_by_profile
              ? task.created_by_profile.full_name || task.created_by_profile.email
              : "System",
            assigned_to: task.assigned_to_profile
              ? task.assigned_to_profile.full_name || task.assigned_to_profile.email
              : null,
          },
        });
      });
    }

    // Add system events
    if (eventsResult.data) {
      eventsResult.data.forEach((event: any) => {
        timelineItems.push({
          id: event.id,
          type: "event",
          created_at: event.created_at,
          data: {
            event_type: event.type,
            metadata: event.metadata,
          },
        });
      });
    }

    // Add reply messages
    if (messagesResult.data) {
      messagesResult.data.forEach((message: any) => {
        timelineItems.push({
          id: message.id,
          type: "reply",
          created_at: message.created_at,
          data: {
            direction: message.direction,
            snippet: message.snippet,
            sender_email: message.sender_email,
          },
        });
      });
    }

    // Sort by created_at descending
    timelineItems.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return NextResponse.json({ timeline: timelineItems });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch timeline" },
      { status: 500 }
    );
  }
}










