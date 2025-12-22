import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json();

  const { lead_ids, owner_id } = body;

  if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
    return NextResponse.json(
      { error: "lead_ids array is required" },
      { status: 400 }
    );
  }

  if (!owner_id) {
    return NextResponse.json(
      { error: "owner_id is required" },
      { status: 400 }
    );
  }

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

  // Check permissions
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Members can only assign to themselves
  if (membership.role === "member" && owner_id !== user.id) {
    return NextResponse.json(
      { error: "Members can only assign leads to themselves" },
      { status: 403 }
    );
  }

  // Verify target owner is a workspace member
  const { data: targetMember } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", owner_id)
    .single();

  if (!targetMember) {
    return NextResponse.json(
      { error: "Target user is not a workspace member" },
      { status: 400 }
    );
  }

  // Verify all leads belong to the workspace
  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .in("id", lead_ids)
    .eq("workspace_id", workspaceId);

  if (leadsError || !leads || leads.length !== lead_ids.length) {
    return NextResponse.json(
      { error: "Some leads not found or don't belong to workspace" },
      { status: 400 }
    );
  }

  // Use bulk assignment function
  const { data, error } = await supabase.rpc("assign_leads_bulk", {
    p_lead_ids: lead_ids,
    p_owner_id: owner_id,
    p_assigned_by: user.id,
  });

  if (error) {
    console.error("Error bulk assigning leads:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    assigned_count: data,
    lead_ids,
    owner_id,
  });
}



