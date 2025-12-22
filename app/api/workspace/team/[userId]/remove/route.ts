import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { userId: string } }
) {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: meMembership } = await supabase
    .from("team_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!meMembership || !["owner", "admin"].includes(meMembership.role)) {
    return Response.json(
      { error: "forbidden", message: "Only owner/admin can remove members." },
      { status: 403 }
    );
  }

  // Can't remove yourself here
  if (params.userId === user.id) {
    return Response.json(
      { error: "cannot_remove_self" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("workspace_id", meMembership.workspace_id)
    .eq("user_id", params.userId);

  if (error) return Response.json({ error }, { status: 400 });

  return Response.json({ ok: true }, { status: 200 });
}

