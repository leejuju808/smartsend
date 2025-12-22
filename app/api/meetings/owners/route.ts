import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
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

  // Fetch all meeting-intent replies for this workspace
  const { data, error } = await supabase
    .from("reply_logs")
    .select("owner_user_id, meeting_stage, deal_value_cents")
    .eq("workspace_id", workspaceId)
    .eq("ai_has_meeting", true);

  if (error) {
    console.error("[meetings.owners] query error", error);
    return Response.json({ error: "query_failed" }, { status: 400 });
  }

  const rows = data || [];

  type Stat = {
    owner_user_id: string | null;
    meeting_count: number;
    closed_won_value_cents: number;
  };

  const map = new Map<string, Stat>();

  for (const r of rows as {
    owner_user_id: string | null;
    meeting_stage: string | null;
    deal_value_cents: number | null;
  }[]) {
    const key = r.owner_user_id ?? "__unassigned__";
    if (!map.has(key)) {
      map.set(key, {
        owner_user_id: r.owner_user_id,
        meeting_count: 0,
        closed_won_value_cents: 0,
      });
    }
    const stat = map.get(key)!;
    stat.meeting_count += 1;

    if (r.meeting_stage === "closed_won" && r.deal_value_cents != null) {
      stat.closed_won_value_cents += r.deal_value_cents;
    }
  }

  const stats = Array.from(map.values()).sort((a, b) => {
    // sort by closed-won desc, then meetings desc
    if (b.closed_won_value_cents !== a.closed_won_value_cents) {
      return b.closed_won_value_cents - a.closed_won_value_cents;
    }
    return b.meeting_count - a.meeting_count;
  });

  return Response.json(
    {
      owners: stats,
    },
    { status: 200 }
  );
}





