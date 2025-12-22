import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // get current user's workspace (simplest: first workspace)
  const { data: membership } = await supabase
    .from("team_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return Response.json(
      { error: "No workspace membership found" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("team_members")
    .select("user_id, email, name, role, created_at")
    .eq("workspace_id", membership.workspace_id)
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error }, { status: 400 });

  return Response.json(
    {
      workspaceId: membership.workspace_id,
      me: { userId: user.id, role: membership.role },
      members: data,
    },
    { status: 200 }
  );
}

