// Block 9200 — Reply Inbox API
// POST /api/inbox/replies/[threadId]/tasks - Create follow-up task

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = await req.json();
  const supabase = createRouteHandlerClient({ cookies });

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace membership
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceIds = memberships.map((m) => m.workspace_id);

  // Get thread to extract contact/lead info
  const { data: thread } = await supabase
    .from("reply_threads")
    .select("workspace_id, contact_id, lead_id, campaign_id")
    .eq("id", threadId)
    .in("workspace_id", workspaceIds)
    .single();

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Create task
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      workspace_id: thread.workspace_id,
      thread_id: threadId,
      lead_id: thread.lead_id,
      campaign_id: thread.campaign_id,
      assigned_to: body.owner || user.id,
      created_by: user.id,
      title: body.title || "Follow-up task",
      description: body.description || null,
      due_date: body.dueDate || null,
      status: "todo",
    })
    .select()
    .single();

  if (taskError) {
    console.error("Error creating task:", taskError);
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }

  return NextResponse.json({ task });
}





























































