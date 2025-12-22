import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const campaign = u.searchParams.get("campaign");
    const since = u.searchParams.get("since") || new Date(Date.now()-7*24*3600*1000).toISOString();

    if (!campaign) {
      return NextResponse.json({ error: "campaign parameter required" }, { status: 400 });
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: sent } = await sb
      .from("send_logs")
      .select("id,created_at")
      .eq("campaign_id", campaign)
      .gte("created_at", since);

    const ids = (sent ?? []).map((x:any)=>x.id);
    
    let opens = 0;
    let clicks = 0;
    
    if (ids.length > 0) {
      const { data: ev } = await sb
        .from("tracking_events")
        .select("type")
        .in("send_log_id", ids);
      
      opens = (ev ?? []).filter((e:any)=>e.type==='open').length;
      clicks = (ev ?? []).filter((e:any)=>e.type==='click').length;
    }

    const totalSent = ids.length;
    const openRate = totalSent ? Math.round(opens/totalSent*100) : 0;
    const clickRate = totalSent ? Math.round(clicks/totalSent*100) : 0;

    return NextResponse.json({
      totalSent,
      opens,
      clicks,
      openRate,
      clickRate
    });
  } catch (error: any) {
    console.error("Campaign metrics error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch metrics" }, { status: 500 });
  }
}














