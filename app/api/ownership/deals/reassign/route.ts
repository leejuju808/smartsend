import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json();

  const { from_user_id, to_user_id, filter } = body;

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is owner or admin
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json(
      { error: "Only owners and admins can reassign deals" },
      { status: 403 }
    );
  }

  // Validate required fields
  if (!to_user_id) {
    return NextResponse.json(
      { error: "to_user_id is required" },
      { status: 400 }
    );
  }

  // Verify to_user_id is a workspace member
  const { data: toMember } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", to_user_id)
    .single();

  if (!toMember) {
    return NextResponse.json(
      { error: "Target user is not a workspace member" },
      { status: 400 }
    );
  }

  // Build query
  let query = supabase
    .from("deals")
    .update({
      owner_id: to_user_id,
    })
    .eq("workspace_id", workspaceId);

  // Apply from_user_id filter
  if (from_user_id === null || from_user_id === "null") {
    query = query.is("owner_id", null);
  } else if (from_user_id) {
    query = query.eq("owner_id", from_user_id);
  }

  // Apply additional filters
  if (filter) {
    if (filter.stage) {
      query = query.eq("stage", filter.stage);
    }
    if (filter.created_before) {
      query = query.lte("created_at", filter.created_before);
    }
    if (filter.created_after) {
      query = query.gte("created_at", filter.created_after);
    }
  }

  // Execute update
  const { data, error } = await query.select("id");

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    updated_count: data?.length || 0,
  });
}








