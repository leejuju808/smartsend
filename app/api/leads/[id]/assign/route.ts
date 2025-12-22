import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const body = await req.json();
  const leadId = params.id;

  const { owner_id } = body;

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

  // Get lead to verify workspace and current owner
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, workspace_id, owner_id")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (lead.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Determine target owner_id (use provided or current user)
  const targetOwnerId = owner_id || user.id;

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

  // Members can only claim unassigned leads or reassign their own leads
  // Owners/admins can assign to anyone
  if (membership.role === "member") {
    if (lead.owner_id && lead.owner_id !== user.id) {
      return NextResponse.json(
        { error: "You can only claim unassigned leads or reassign your own leads" },
        { status: 403 }
      );
    }
  }

  // Verify target owner is a workspace member
  if (targetOwnerId) {
    const { data: targetMember } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", targetOwnerId)
      .single();

    if (!targetMember) {
      return NextResponse.json(
        { error: "Target user is not a workspace member" },
        { status: 400 }
      );
    }
  }

  // Use manual assignment function
  const { error: assignError } = await supabase.rpc("assign_lead_manual", {
    p_lead_id: leadId,
    p_owner_id: targetOwnerId || null,
    p_assigned_by: user.id,
  });

  if (assignError) {
    console.error("Error assigning lead:", assignError);
    return NextResponse.json(
      { error: assignError.message },
      { status: 400 }
    );
  }

  // Fetch updated lead
  const { data: updatedLead, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (fetchError) {
    return NextResponse.json(
      { error: fetchError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ lead: updatedLead });
}






