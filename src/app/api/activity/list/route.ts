import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");
    const type = searchParams.get("type") || "all"; // 'queued','sending','sent','failed','retry_queued','replied','throttle'
    const page = Number(searchParams.get("page") || "1");
    const pageSize = Math.min(Number(searchParams.get("pageSize") || "30"), 100);

    if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

    let q = supabase
      .from("campaign_logs")
      .select("id,created_at,type,lead_id,meta")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (type !== "all") q = q.eq("type", type);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await q.range(from, to).select("*", { count: "exact" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Normalize field name to event_type for UI compatibility
    const rows = (data ?? []).map((r: any) => ({ ...r, event_type: r.type }));

    return NextResponse.json({ rows, total: count ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server_error" }, { status: 500 });
  }
}


