import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
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

  const { data, error } = await supabase
    .from("campaign_outcomes")
    .select(
      "campaign_id, total_sent, total_replies, total_meetings, closed_won_value_cents"
    )
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("[campaigns.outcomes] query error", error);
    return Response.json({ error: "query_failed" }, { status: 400 });
  }

  return Response.json(
    {
      outcomes: data ?? [],
    },
    { status: 200 }
  );
}





