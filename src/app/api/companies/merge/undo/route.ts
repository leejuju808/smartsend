import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "no workspace" }, { status: 401 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Check if user is owner/admin
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!member || !["owner", "admin"].includes(member.role)) {
    return NextResponse.json(
      { error: "Only owners and admins can undo merges" },
      { status: 403 }
    );
  }

  const { merge_event_id } = await req.json();

  if (!merge_event_id) {
    return NextResponse.json(
      { error: "merge_event_id is required" },
      { status: 400 }
    );
  }

  try {
    const { error } = await supabase.rpc("undo_company_merge", {
      p_merge_event_id: merge_event_id,
      p_undone_by: user.id,
    });

    if (error) {
      console.error("Error undoing merge:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Merge undone successfully",
    });
  } catch (error: any) {
    console.error("Error in undo merge:", error);
    return NextResponse.json(
      { error: error.message || "Failed to undo merge" },
      { status: 500 }
    );
  }
}








