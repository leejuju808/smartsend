import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const replyId = params.id;

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const status: string | undefined = body.status;
  const assignToSelf: boolean | undefined = body.assignToSelf;

  if (
    status &&
    !["new", "handling", "done"].includes(status)
  ) {
    return Response.json({ error: "invalid_status" }, { status: 400 });
  }

  // Resolve workspace
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // ensure this reply belongs to the workspace
  const { data: reply, error: findErr } = await supabase
    .from("reply_logs")
    .select("id, workspace_id")
    .eq("id", replyId)
    .maybeSingle();

  if (findErr) {
    console.error("[reply.status] fetch error", findErr);
    return Response.json({ error: "query_failed" }, { status: 400 });
  }

  if (!reply || reply.workspace_id !== workspaceId) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const patch: any = {};
  if (status) patch.status = status;
  if (assignToSelf) patch.owner_user_id = user.id;

  if (Object.keys(patch).length === 0) {
    return Response.json(
      { error: "nothing_to_update" },
      { status: 400 }
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("reply_logs")
    .update(patch)
    .eq("id", replyId)
    .select(
      "id, status, owner_user_id"
    )
    .maybeSingle();

  if (updateErr) {
    console.error("[reply.status] update error", updateErr);
    return Response.json({ error: "update_failed" }, { status: 400 });
  }

  return Response.json(
    {
      reply: updated,
    },
    { status: 200 }
  );
}





