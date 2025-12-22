import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  const body = await req.json();
  const { leadId, campaignId, status } = body as {
    leadId?: string;
    campaignId?: string;
    status?: "open" | "handled";
  };

  if (!leadId || !campaignId || !status) {
    return Response.json(
      { error: "missing_fields" },
      { status: 400 }
    );
  }

  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // Upsert thread state
  const { data, error } = await supabase
    .from("reply_thread_state")
    .upsert(
      {
        workspace_id: workspaceId,
        lead_id: leadId,
        campaign_id: campaignId,
        status,
        last_updated_by: user.id,
      },
      {
        onConflict: "workspace_id,lead_id,campaign_id",
      }
    )
    .select("workspace_id, lead_id, campaign_id, status")
    .single();

  if (error) {
    console.error("thread state update error", error);
    return Response.json({ error: "update_failed" }, { status: 400 });
  }

  return Response.json({ state: data }, { status: 200 });
}






