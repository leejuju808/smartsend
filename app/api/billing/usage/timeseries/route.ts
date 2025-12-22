import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace membership
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  // Fallback to workspace_members if team_members doesn't have a match
  let workspaceId: string | null = null;
  if (membership) {
    workspaceId = membership.workspace_id;
  } else {
    const { data: wsMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    
    if (wsMember) {
      workspaceId = wsMember.workspace_id;
    }
  }

  if (!workspaceId) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 29);
  const fromStr = fromDate.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("workspace_usage_daily")
    .select("*")
    .eq("workspace_id", workspaceId)
    .gte("day", fromStr)
    .order("day", { ascending: true });

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json({ points: data || [] }, { status: 200 });
}







