import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyStopFollowupsForReply } from "@/lib/inbox/applyStopFollowups";

export async function POST(
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

  // Resolve workspace via membership
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // Ensure reply belongs to this workspace
  const { data: reply, error: replyErr } = await supabase
    .from("reply_logs")
    .select("id, workspace_id")
    .eq("id", replyId)
    .maybeSingle();

  if (replyErr) {
    console.error("[stop-followups] reply fetch error", replyErr);
    return Response.json({ error: "reply_fetch_failed" }, { status: 400 });
  }

  if (!reply || reply.workspace_id !== workspaceId) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const result = await applyStopFollowupsForReply(replyId);

  if (!result.ok) {
    return Response.json(
      {
        error: "apply_failed",
        reason: result.reason,
      },
      { status: 400 }
    );
  }

  return Response.json(
    {
      ok: true,
      lead_ids: result.leadIds ?? [],
    },
    { status: 200 }
  );
}





