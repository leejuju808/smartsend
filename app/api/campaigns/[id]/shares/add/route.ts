import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { userId, role } = await req.json();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  if (!role || !["owner", "editor", "viewer"].includes(role)) {
    return Response.json({ error: "Invalid role. Must be owner, editor, or viewer" }, { status: 400 });
  }

  // Get campaign to check workspace
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("workspace_id")
    .eq("id", params.id)
    .single();

  if (campErr || !campaign) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Check if current user has permission to share (must be workspace member)
  const { data: teamMember } = await supabase
    .from("team_members")
    .select("role")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  const { data: wsMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .single();

  const isWorkspaceMember = !!teamMember || !!wsMember;
  if (!isWorkspaceMember) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if user being shared is in the workspace
  const { data: targetTeamMember } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  const { data: targetWsMember } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", userId)
    .single();

  if (!targetTeamMember && !targetWsMember) {
    return Response.json({ error: "User must be a workspace member" }, { status: 400 });
  }

  // Insert or update share
  const { error } = await supabase
    .from("campaign_shares")
    .upsert({
      campaign_id: params.id,
      user_id: userId,
      role: role || "viewer",
      workspace_id: campaign.workspace_id,
    }, {
      onConflict: "campaign_id,user_id"
    });

  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({ ok: true }, { status: 200 });
}







