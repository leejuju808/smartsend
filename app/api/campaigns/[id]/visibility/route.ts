import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/campaigns/[id]/visibility
 * Change campaign visibility (workspace | restricted)
 * 
 * Body: { visibility: "workspace" | "restricted" }
 * 
 * Requirements:
 * - Only workspace Owner or Admin can change visibility
 * - (Optional) Campaign owner can change if allowed by workspace policy
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
  const { visibility } = body;

  if (!visibility || !["workspace", "restricted"].includes(visibility)) {
    return NextResponse.json(
      { error: "visibility must be 'workspace' or 'restricted'" },
      { status: 400 }
    );
  }

  // Load campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, workspace_id, owner_id, visibility")
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

  // Allow workspace owner/admin OR campaign owner
  const isOwnerOrAdmin = userRole && ["owner", "admin"].includes(userRole);
  const isCampaignOwner = campaign.owner_id === user.id;

  if (!isOwnerOrAdmin && !isCampaignOwner) {
    return NextResponse.json(
      { error: "Only workspace owners/admins or campaign owner can change visibility" },
      { status: 403 }
    );
  }

  // Update visibility
  const { data: updatedCampaign, error: updateError } = await supabase
    .from("campaigns")
    .update({ visibility })
    .eq("id", params.id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update visibility", details: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    campaign: updatedCampaign,
  });
}









