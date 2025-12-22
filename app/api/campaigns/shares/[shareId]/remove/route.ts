import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { shareId: string } }
) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the share to check campaign and workspace
  const { data: share, error: shareErr } = await supabase
    .from("campaign_shares")
    .select("campaign_id, workspace_id")
    .eq("id", params.shareId)
    .single();

  if (shareErr || !share) {
    return Response.json({ error: "Share not found" }, { status: 404 });
  }

  // Check if current user has permission to remove shares (must be workspace member)
  const { data: teamMember } = await supabase
    .from("team_members")
    .select("role")
    .eq("workspace_id", share.workspace_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  const { data: wsMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", share.workspace_id)
    .eq("user_id", user.id)
    .single();

  const isWorkspaceMember = !!teamMember || !!wsMember;
  if (!isWorkspaceMember) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete the share
  const { error } = await supabase
    .from("campaign_shares")
    .delete()
    .eq("id", params.shareId);

  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({ ok: true }, { status: 200 });
}







