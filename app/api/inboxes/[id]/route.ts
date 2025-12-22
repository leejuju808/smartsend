import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { daily_limit, warmup_enabled } = body;

    // Verify inbox belongs to user's workspace
    const { data: inbox, error: inboxError } = await supabase
      .from("sender_inboxes")
      .select("workspace_id")
      .eq("id", params.id)
      .single();

    if (inboxError || !inbox) {
      return NextResponse.json({ error: "Inbox not found" }, { status: 404 });
    }

    // Verify user is member of workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", inbox.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Update inbox
    const updates: any = {};
    if (daily_limit !== undefined) updates.daily_limit = daily_limit;
    if (warmup_enabled !== undefined) updates.warmup_enabled = warmup_enabled;

    const { data, error } = await supabase
      .from("sender_inboxes")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Error updating inbox:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



