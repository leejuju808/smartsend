import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user has access to this campaign
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("workspace_id")
    .eq("id", params.id)
    .single();

  if (!campaign) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Check workspace membership
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
  const isAdmin = teamMember?.role === "owner" || teamMember?.role === "admin" || 
                  wsMember?.role === "owner" || wsMember?.role === "admin";

  // Check if user is shared on this campaign
  const { data: share } = await supabase
    .from("campaign_shares")
    .select("role")
    .eq("campaign_id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!isWorkspaceMember && !share) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // List all shares for this campaign
  const { data, error } = await supabase
    .from("campaign_shares")
    .select("id, user_id, role, created_at")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({ shares: data || [] }, { status: 200 });
}







