import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { campaignId } = await req.json();
    if (!campaignId) throw new Error("campaignId required");

    // counts by status
    const statuses = ["pending","queued","sending","sent","no_reply","failed","bounced","replied"];
    const counts: Record<string, number> = {};
    for (const s of statuses) {
      const { count, error } = await supabaseAdmin
        .from("leads").select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", s);
      if (error) throw error;
      counts[s] = count ?? 0;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const sent = counts.sent;
    const replied = counts.replied;
    const bounce = counts.bounced;

    return NextResponse.json({
      ok: true,
      total,
      counts,
      replyRate: total ? Number(((replied / Math.max(1, sent)) * 100).toFixed(2)) : 0,
      bounceRate: total ? Number(((bounce / Math.max(1, sent)) * 100).toFixed(2)) : 0,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
  }
}
