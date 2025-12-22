import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const campaignId = params.id;
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // 7-day
  const seven = await admin.rpc("campaign_metrics_last_7d", { p_campaign: campaignId });
  // 24h counters
  const twenty4 = await admin.rpc("campaign_counters_24h", { p_campaign: campaignId });
  // Top links
  const top = await admin.rpc("campaign_top_links_7d", { p_campaign: campaignId, p_limit: 8 });

  if (seven.error) return new Response(seven.error.message, { status: 400 });
  if (twenty4.error) return new Response(twenty4.error.message, { status: 400 });
  if (top.error) return new Response(top.error.message, { status: 400 });

  // Reply rate 7d: threads with replied_at in last 7 days / active threads in last 7 days
  const replied = await admin
    .from("inbox_threads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .gte("replied_at", new Date(Date.now() - 7 * 86400 * 1000).toISOString());

  const active = await admin
    .from("inbox_threads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .gte("updated_at", new Date(Date.now() - 7 * 86400 * 1000).toISOString());

  const replyRate7d = active.count ? (replied.count || 0) / active.count : 0;

  return new Response(
    JSON.stringify({
      spark: seven.data,              // [{ day, sent, opens, clicks, unsubscribes, replies }]
      counters24h: twenty4.data?.[0], // { sent_24h, opens_24h, ... }
      topLinks: top.data,             // [{ url, clicks }]
      replyRate7d,
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } }
  );
}

