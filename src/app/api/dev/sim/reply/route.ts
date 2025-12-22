import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function devOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("This endpoint is disabled in production.");
  }
}

export async function POST(req: NextRequest) {
  try {
    devOnly();
    const { campaignId, leadId } = await req.json();
    if (!campaignId || !leadId) {
      return NextResponse.json({ error: "campaignId and leadId required" }, { status: 400 });
    }

    const { error: uErr } = await supabaseAdmin
      .from("leads")
      .update({ status: "replied" })
      .eq("id", leadId)
      .eq("campaign_id", campaignId);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

    await supabaseAdmin.from("campaign_logs").insert({
      campaign_id: campaignId,
      lead_id: leadId,
      event: "replied",
      detail: { source: "dev_sim" },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}


