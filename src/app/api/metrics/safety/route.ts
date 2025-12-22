import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign_id");
  const range = (url.searchParams.get("range") || "7d").toLowerCase(); // 7d|14d|30d
  const view =
    range === "30d" ? "v_safety_stats_30d" :
    range === "14d" ? "v_safety_stats_14d" :
    "v_safety_stats_7d";

  let q = supabase.from(view).select("day, campaign_id, kind, count");
  if (campaignId) q = q.eq("campaign_id", campaignId);

  const { data, error } = await q.order("day", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Shape for charts: [{day, reply_stop, suppression, total}]
  const map = new Map<string, any>();
  for (const r of data ?? []) {
    const key = `${r.day}`;
    const row = map.get(key) || { day: r.day, reply_stop: 0, suppression: 0, total: 0 };
    row[r.kind] = (row[r.kind] || 0) + r.count;
    row.total = (row.reply_stop || 0) + (row.suppression || 0);
    map.set(key, row);
  }

  return NextResponse.json({ rows: Array.from(map.values()) });
}


