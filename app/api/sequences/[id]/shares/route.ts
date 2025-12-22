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

  // Check if user has access to this sequence
  const { data: sequence } = await supabase
    .from("sequences")
    .select("workspace_id")
    .eq("id", params.id)
    .single();

  if (!sequence) {
    return Response.json({ error: "Sequence not found" }, { status: 404 });
  }

  // Check workspace membership
  const { data: teamMember } = await supabase
    .from("team_members")
    .select("role")
    .eq("workspace_id", sequence.workspace_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  const { data: wsMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", sequence.workspace_id)
    .eq("user_id", user.id)
    .single();

  const isWorkspaceMember = !!teamMember || !!wsMember;
  const isAdmin = teamMember?.role === "owner" || teamMember?.role === "admin" || 
                  wsMember?.role === "owner" || wsMember?.role === "admin";

  // Check if user is shared on this sequence
  const { data: share } = await supabase
    .from("sequence_shares")
    .select("role")
    .eq("sequence_id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!isWorkspaceMember && !share) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // List all shares for this sequence
  const { data, error } = await supabase
    .from("sequence_shares")
    .select("id, user_id, role, created_at")
    .eq("sequence_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({ shares: data || [] }, { status: 200 });
}







