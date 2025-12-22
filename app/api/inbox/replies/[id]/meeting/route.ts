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

  const meetingStage: string | undefined = body.meeting_stage;
  const dealValue: number | undefined = body.deal_value_cents;
  const meetingNote: string | undefined = body.meeting_note;

  if (
    meetingStage &&
    !["lead", "qualified", "proposal", "closed_won", "closed_lost"].includes(
      meetingStage
    )
  ) {
    return Response.json({ error: "invalid_meeting_stage" }, { status: 400 });
  }

  // Resolve workspace via team_members
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
    console.error("[reply.meeting] fetch error", replyErr);
    return Response.json({ error: "query_failed" }, { status: 400 });
  }

  if (!reply || reply.workspace_id !== workspaceId) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const patch: any = {};
  if (meetingStage !== undefined) patch.meeting_stage = meetingStage;
  if (dealValue !== undefined) patch.deal_value_cents = dealValue;
  if (meetingNote !== undefined) patch.meeting_note = meetingNote;

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
      "id, meeting_stage, deal_value_cents, meeting_note"
    )
    .maybeSingle();

  if (updateErr) {
    console.error("[reply.meeting] update error", updateErr);
    return Response.json({ error: "update_failed" }, { status: 400 });
  }

  return Response.json(
    {
      reply: updated,
    },
    { status: 200 }
  );
}





