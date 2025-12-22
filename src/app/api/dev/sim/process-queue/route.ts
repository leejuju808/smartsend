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
    const { campaignId, batchSize = 20 } = await req.json();
    if (!campaignId) {
      return NextResponse.json({ error: "campaignId required" }, { status: 400 });
    }

    const { data: queued, error: qErr } = await supabaseAdmin
      .from("leads")
      .select("id, email, send_attempts")
      .eq("campaign_id", campaignId)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
    if (!queued?.length) return NextResponse.json({ processed: 0, sent: 0, failed: 0 });

    const ids = queued.map((r) => r.id);
    const { error: sErr } = await supabaseAdmin
      .from("leads")
      .update({ status: "sending" })
      .in("id", ids);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    await supabaseAdmin.from("campaign_logs").insert(
      queued.map((r) => ({
        campaign_id: campaignId,
        lead_id: r.id,
        event: "sending",
        detail: { source: "dev_sim" },
      }))
    );

    const toFail = queued.filter((_, i) => (i + 1) % 3 === 0).map((r) => r.id);
    const toSend = queued.filter((r) => !toFail.includes(r.id)).map((r) => r.id);

    if (toSend.length) {
      await supabaseAdmin.from("leads").update({ status: "sent" }).in("id", toSend);
      await supabaseAdmin.from("campaign_logs").insert(
        toSend.map((id) => ({
          campaign_id: campaignId,
          lead_id: id,
          event: "sent",
          detail: { source: "dev_sim" },
        }))
      );
    }

    if (toFail.length) {
      await supabaseAdmin.from("leads").update({ status: "failed" }).in("id", toFail);
      await supabaseAdmin.rpc("increment_attempts_for", { p_lead_ids: toFail });
      await supabaseAdmin.from("campaign_logs").insert(
        toFail.map((id) => ({
          campaign_id: campaignId,
          lead_id: id,
          event: "failed",
          detail: { reason: "simulated", source: "dev_sim" },
        }))
      );
    }

    return NextResponse.json({ processed: queued.length, sent: toSend.length, failed: toFail.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}


