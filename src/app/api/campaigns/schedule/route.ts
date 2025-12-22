import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { campaignId, leads, startTime, intervalSeconds } = await req.json();

    if (!campaignId || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { error: "Missing campaignId or leads" },
        { status: 400 }
      );
    }

    const base = new Date(startTime || Date.now());
    const rows = leads.map((lead: any, i: number) => ({
      campaign_id: campaignId,
      lead_id: lead.id,
      scheduled_at: new Date(
        base.getTime() + i * (intervalSeconds || 60) * 1000
      ).toISOString(),
    }));

    const { error } = await supabase.from("campaign_sends").insert(rows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
