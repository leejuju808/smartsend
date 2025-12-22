// app/api/inbox/label/route.ts
// Block 10900 — Update thread intent label
// POST /api/inbox/label - Update thread intent (hot, warm, follow_up, not_interested)

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { thread_id, intent } = body;

    if (!thread_id || !intent) {
      return NextResponse.json(
        { error: "Missing thread_id or intent" },
        { status: 400 }
      );
    }

    // Validate intent value
    const validIntents = ["hot", "warm", "follow_up", "not_interested", "unclassified"];
    if (!validIntents.includes(intent)) {
      return NextResponse.json(
        { error: `Invalid intent. Must be one of: ${validIntents.join(", ")}` },
        { status: 400 }
      );
    }

    // Get user's workspace memberships
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    const workspaceIds = memberships?.map((m) => m.workspace_id) || [];

    // Verify thread exists and user has access
    let threadQuery = supabase
      .from("reply_threads")
      .select("id, workspace_id, account_id, lead_id, campaign_id")
      .eq("id", thread_id);

    if (workspaceIds.length > 0) {
      threadQuery = threadQuery.in("workspace_id", workspaceIds);
    } else {
      threadQuery = threadQuery.eq("account_id", user.id);
    }

    const { data: thread, error: threadError } = await threadQuery.single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Update thread intent
    const { error: updateError } = await supabase
      .from("reply_threads")
      .update({
        latest_intent: intent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread_id);

    if (updateError) {
      console.error("Error updating thread intent:", updateError);
      return NextResponse.json(
        { error: "Failed to update intent" },
        { status: 500 }
      );
    }

    // If intent is "not_interested", optionally create a suppression record
    if (intent === "not_interested" && thread.lead_id) {
      // Check if suppression table exists and add entry
      const { error: suppressError } = await supabase
        .from("suppressions")
        .insert({
          lead_id: thread.lead_id,
          reason: "marked_not_interested",
          created_by: user.id,
        })
        .select()
        .single();

      // Ignore error if suppressions table doesn't exist or entry already exists
      if (suppressError && !suppressError.message.includes("duplicate")) {
        console.warn("Failed to create suppression:", suppressError);
      }
    }

    // If intent is "hot" or "warm", optionally create a task
    if ((intent === "hot" || intent === "warm") && thread.lead_id) {
      const taskDueDate = new Date();
      if (intent === "hot") {
        // Hot leads: due today
        taskDueDate.setHours(17, 0, 0, 0); // End of business day
      } else {
        // Warm leads: due tomorrow
        taskDueDate.setDate(taskDueDate.getDate() + 1);
        taskDueDate.setHours(17, 0, 0, 0);
      }

      // Check if tasks table exists
      const { error: taskError } = await supabase
        .from("tasks")
        .insert({
          org_id: thread.workspace_id || thread.account_id,
          contact_id: thread.lead_id,
          reply_thread_id: thread_id,
          assigned_to: user.id,
          title: intent === "hot" ? "Follow up with hot lead" : "Follow up with warm lead",
          notes: `Lead marked as ${intent}. Follow up required.`,
          due_at: taskDueDate.toISOString(),
          auto_generated: true,
          auto_type: `${intent}_lead`,
          created_by: user.id,
        })
        .select()
        .single();

      // Ignore error if tasks table doesn't exist or task already exists
      if (taskError && !taskError.message.includes("duplicate")) {
        console.warn("Failed to create task:", taskError);
      }
    }

    return NextResponse.json(
      { success: true, thread_id, intent },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Label update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update label" },
      { status: 500 }
    );
  }
}























































