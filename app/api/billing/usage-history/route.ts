import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
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

  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? Math.min(Math.max(parseInt(daysParam, 10) || 30, 1), 90) : 30;

  // pull from the last N days (but view already limits to 30; this is future-proof)
  const { data, error } = await supabase
    .from("workspace_daily_usage_30d")
    .select("usage_date, sends_count, replies_count")
    .eq("workspace_id", workspaceId)
    .order("usage_date", { ascending: true });

  if (error) {
    console.error("[billing.usage-history] query error", error);
    return Response.json({ error: "query_failed" }, { status: 400 });
  }

  return Response.json(
    {
      days,
      points: data || [],
    },
    { status: 200 }
  );
}





