import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json();

  const { lead_id, new_estimator_id, reason } = body;

  if (!lead_id || !new_estimator_id || !reason) {
    return NextResponse.json(
      { error: "Missing required fields: lead_id, new_estimator_id, reason" },
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

  // Verify lead belongs to workspace
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", lead_id)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (lead.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify target estimator is a workspace member
  const { data: targetMember } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", new_estimator_id)
    .single();

  if (!targetMember) {
    return NextResponse.json(
      { error: "Target user is not a workspace member" },
      { status: 400 }
    );
  }

  // Check permissions (members can only reassign their own leads, owners/admins can reassign any)
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (membership.role === "member") {
    const { data: currentLead } = await supabase
      .from("leads")
      .select("owner_id")
      .eq("id", lead_id)
      .single();

    if (currentLead?.owner_id && currentLead.owner_id !== user.id) {
      return NextResponse.json(
        { error: "You can only reassign your own leads" },
        { status: 403 }
      );
    }
  }

  // Call the database function to perform handoff
  const { data, error } = await supabase.rpc("perform_lead_handoff", {
    p_lead_id: lead_id,
    p_new_owner_id: new_estimator_id,
    p_reason: reason,
    p_triggered_by: user.id,
  });

  if (error) {
    console.error("Error performing handoff:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Handoff complete",
    data,
  });
}









































