import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;
  const supabase = getServerSupabase();

  // Workspace totals by summing per-campaign (fast + leverages view)
  const { data: rows, error } = await supabase
    .from("campaign_analytics")
    .select("sent, unique_opens, unique_clicks, replies, open_rate_pct, click_rate_pct, reply_rate_pct")
    .eq("workspace_id", gate.workspace_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totals = rows?.reduce((acc, r) => {
    acc.sent += r.sent;
    acc.unique_opens += r.unique_opens;
    acc.unique_clicks += r.unique_clicks;
    acc.replies += r.replies;
    return acc;
  }, { sent: 0, unique_opens: 0, unique_clicks: 0, replies: 0 })!;

  const pct = (num: number, den: number) => (den > 0 ? Math.round((10000 * num) / den) / 100 : 0);

  return NextResponse.json({
    sent: totals.sent,
    open_rate_pct: pct(totals.unique_opens, totals.sent),
    click_rate_pct: pct(totals.unique_clicks, totals.sent),
    reply_rate_pct: pct(totals.replies, totals.sent),
  });
}