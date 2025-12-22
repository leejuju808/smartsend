export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data } = await supabase
    .from("campaign_recipients")
    .select("status", { count: "exact" })
    .eq("campaign_id", params.id);
  const sent = (data || []).filter((r: any) => r.status === "sent").length;
  const failed = (data || []).filter((r: any) => r.status === "failed").length;
  const skipped = (data || []).filter((r: any) => r.status === "skipped").length;
  const { data: camp } = await supabase.from("campaigns").select("status,total,sent,failed,skipped").eq("id", params.id).single();
  // Distinct openers/clickers via recipient aggregates
  const { count: openCount } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", params.id)
    .gt("open_count", 0);
  const { count: clickCount } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", params.id)
    .gt("click_count", 0);
  
  // Heatmap v2 data
  const [{ data: heatmap_hour }, { data: heatmap_dow }] = await Promise.all([
    supabase.rpc("campaign_heatmap_hour", { cid: params.id }),
    supabase.rpc("campaign_heatmap_dow", { cid: params.id })
  ]);

  return NextResponse.json({
    status: camp?.status,
    total: camp?.total || 0,
    sent: sent || camp?.sent || 0,
    failed: failed || camp?.failed || 0,
    skipped: skipped || camp?.skipped || 0,
    opens: openCount || 0,
    clicks: clickCount || 0,
    heatmap_hour: heatmap_hour || [],
    heatmap_dow: heatmap_dow || [],
  });
}

