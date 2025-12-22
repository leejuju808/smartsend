import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/campaigns/[id]/owner
 * Transfer campaign ownership to another team member
 * 
 * Body: { new_owner_id: string }
 * 
 * Requirements:
 * - Only workspace Owner or Admin can change owner
 * - new_owner_id must be a current team member in same workspace
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  
  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  const body = await req.json();
  const { new_owner_id } = body;

  if (!new_owner_id) {
    return NextResponse.json(
      { error: "new_owner_id is required" },
      { status: 400 }
    );
  }

  // Load campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, workspace_id, owner_id")
    .eq("id", params.id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Check if user is workspace owner or admin
  const { data: teamMember } = await supabase
    .from("team_members")
    .select("role")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .single();

  const userRole = teamMember?.role || workspaceMember?.role;

  if (!userRole || !["owner", "admin"].includes(userRole)) {
    return NextResponse.json(
      { error: "Only workspace owners and admins can transfer ownership" },
      { status: 403 }
    );
  }

  // Verify new_owner_id is a team member in the same workspace
  const { data: newOwnerMember, error: memberError } = await supabase
    .from("team_members")
    .select("id, user_id, role, status")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", new_owner_id)
    .eq("status", "active")
    .single();

  // Fallback to workspace_members if not in team_members
  let newOwnerUserId = new_owner_id;
  if (!newOwnerMember) {
    const { data: wsMember } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", campaign.workspace_id)
      .eq("user_id", new_owner_id)
      .single();

    if (!wsMember) {
      return NextResponse.json(
        { error: "User is not a member of this workspace" },
        { status: 400 }
      );
    }
    newOwnerUserId = wsMember.user_id;
  } else {
    newOwnerUserId = newOwnerMember.user_id;
  }

  // Update campaign owner
  const { data: updatedCampaign, error: updateError } = await supabase
    .from("campaigns")
    .update({ owner_id: newOwnerUserId })
    .eq("id", params.id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update owner", details: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    campaign: updatedCampaign,
  });
}









