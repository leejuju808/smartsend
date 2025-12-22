import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type MutatePayload = {
  action: "mark_read" | "mark_unread" | "archive" | "unarchive";
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let workspaceId = user.app_metadata?.workspace_id as string | undefined;
  
  // If workspace_id not in JWT, get from workspace_members
  if (!workspaceId) {
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }
    workspaceId = membership.workspace_id;
  }

  const body = (await req.json()) as MutatePayload;
  const action = body.action;
  const threadId = params.id;

  let patch: Record<string, any> = {};

  if (action === "mark_read") patch.unread = false;
  if (action === "mark_unread") patch.unread = true;
  if (action === "archive") patch.is_archived = true;
  if (action === "unarchive") patch.is_archived = false;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("reply_threads")
    .update(patch)
    .eq("id", threadId)
    .eq("workspace_id", workspaceId);

  if (updateError) {
    console.error(updateError);
    return NextResponse.json({ error: "Failed to update thread" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

