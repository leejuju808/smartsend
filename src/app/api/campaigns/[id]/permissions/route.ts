// Block 416 — Team Collaboration v1: Campaign Permissions API
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

// GET: Fetch campaign permissions for all workspace members
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;

    // Get campaign workspace
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("workspace_id")
      .eq("id", campaignId)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Get all workspace members
    const { data: workspaceMembers, error: membersError } = await supabase
      .from("workspace_members")
      .select(`
        id,
        user_id,
        role,
        invited_email,
        profiles:user_id (
          email,
          full_name
        )
      `)
      .eq("workspace_id", campaign.workspace_id);

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    // Get campaign permissions
    const { data: permissions, error: permsError } = await supabase
      .from("campaign_permissions")
      .select("*")
      .eq("campaign_id", campaignId);

    if (permsError) {
      return NextResponse.json({ error: permsError.message }, { status: 500 });
    }

    // Merge members with permissions
    const membersWithPermissions = (workspaceMembers || []).map((member) => {
      const perm = permissions?.find((p) => p.user_id === member.user_id);
      const email = member.invited_email || member.profiles?.email || member.user_id;

      return {
        id: member.id,
        user_id: member.user_id,
        email,
        name: member.profiles?.full_name || email,
        workspace_role: member.role,
        can_view: perm?.can_view ?? true,
        can_edit: perm?.can_edit ?? false,
        can_send: perm?.can_send ?? false,
        can_view_analytics: perm?.can_view_analytics ?? true,
        permission_id: perm?.id,
      };
    });

    return NextResponse.json({ members: membersWithPermissions });
  } catch (error) {
    console.error("Error fetching campaign permissions:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH: Update campaign permission for a user
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;
    const { user_id, permission, value } = await req.json();

    if (!user_id || !permission || typeof value !== "boolean") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const validPermissions = ["can_view", "can_edit", "can_send", "can_view_analytics"];
    if (!validPermissions.includes(permission)) {
      return NextResponse.json({ error: "Invalid permission" }, { status: 400 });
    }

    // Check if permission exists
    const { data: existing } = await supabase
      .from("campaign_permissions")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("user_id", user_id)
      .single();

    if (existing) {
      // Update existing permission
      const { error } = await supabase
        .from("campaign_permissions")
        .update({ [permission]: value })
        .eq("id", existing.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      // Create new permission record
      const { error } = await supabase
        .from("campaign_permissions")
        .insert({
          campaign_id: campaignId,
          user_id,
          [permission]: value,
          // Set defaults for other permissions
          can_view: permission === "can_view" ? value : true,
          can_edit: permission === "can_edit" ? value : false,
          can_send: permission === "can_send" ? value : false,
          can_view_analytics: permission === "can_view_analytics" ? value : true,
        });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // Log the action
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("workspace_id")
      .eq("id", campaignId)
      .single();

    if (campaign?.workspace_id) {
      await supabase.rpc("log_action", {
        p_actor_id: user.id,
        p_workspace_id: campaign.workspace_id,
        p_action: "campaign_permission_updated",
        p_target_type: "campaign_permission",
        p_target_id: user_id,
        p_details: { campaign_id: campaignId, permission, value }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating campaign permission:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}



