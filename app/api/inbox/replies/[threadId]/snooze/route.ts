// Block 11900 — Inbox Snooze & Reminders v1
// POST /api/inbox/replies/[threadId]/snooze - Snooze a thread

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { logContactActivity } from "@/lib/contactActivity";

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

  // Validate until timestamp
  const until = body.until;
  if (!until) {
    return NextResponse.json({ error: "until timestamp is required" }, { status: 400 });
  }

  const untilDate = new Date(until);
  if (isNaN(untilDate.getTime())) {
    return NextResponse.json({ error: "Invalid until timestamp" }, { status: 400 });
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

  // Verify thread exists and user has access
  const { data: thread, error: threadError } = await supabase
    .from("reply_threads")
    .select(`
      id,
      account_id,
      lead_id,
      campaign_id,
      owner_id,
      workspace_id
    `)
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Check workspace access (if workspace_id exists, otherwise check account_id)
  let hasAccess = false;
  if (thread.workspace_id) {
    hasAccess = workspaceIds.includes(thread.workspace_id);
  } else if (thread.account_id) {
    // Fallback: check if user is the account owner
    hasAccess = thread.account_id === user.id;
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Update thread with snoozed_until
  const { data: updatedThread, error: updateError } = await supabase
    .from("reply_threads")
    .update({
      snoozed_until: untilDate.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId)
    .select()
    .single();

  if (updateError) {
    console.error("Error snoozing thread:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Get lead info for activity logging
  const { data: lead } = await supabase
    .from("leads")
    .select("id, email, first_name, last_name")
    .eq("id", thread.lead_id)
    .single();

  // Log activity timeline event
  if (lead) {
    const workspaceId = thread.workspace_id || thread.account_id;
    await logContactActivity({
      orgId: workspaceId,
      contactId: lead.id,
      type: 'status_changed',
      title: 'Thread snoozed',
      description: `Snoozed until ${untilDate.toLocaleString()}`,
      userId: user.id,
      campaignId: thread.campaign_id || null,
      replyThreadId: threadId,
      meta: {
        action: 'thread_snoozed',
        until: untilDate.toISOString(),
        thread_id: threadId,
      },
    });
  }

  return NextResponse.json({
    thread: updatedThread,
    snoozed_until: updatedThread.snoozed_until,
  });
}




























































