import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const campaign = u.searchParams.get("campaign");
    const step = u.searchParams.get("step");

    if (!campaign || !step) {
      return NextResponse.json({ error: "campaign and step parameters required" }, { status: 400 });
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch variant details and metrics
    const { data: variants, error: variantError } = await sb
      .from("campaign_step_variants")
      .select("*")
      .eq("campaign_id", campaign)
      .eq("step_no", Number(step));

    const { data: metrics, error: metricsError } = await sb
      .from("v_variant_rates")
      .select("*")
      .eq("campaign_id", campaign)
      .eq("step_no", Number(step));

    if (variantError || metricsError) {
      console.error("Variant metrics error:", variantError || metricsError);
      return NextResponse.json({ error: (variantError || metricsError)?.message || "Failed to fetch variant data" }, { status: 500 });
    }

    // Merge variant details with metrics
    const metricsMap = new Map((metrics ?? []).map((m: any) => [m.variant_id, m]));
    const rows = (variants ?? []).map((v: any) => {
      const m = metricsMap.get(v.id) || { sent: 0, opens: 0, clicks: 0, replies: 0, open_rate: 0, click_rate: 0, reply_rate: 0 };
      return {
        ...v,
        ...m,
        open_rate: m.open_rate ? Math.round(m.open_rate * 100) : 0,
        click_rate: m.click_rate ? Math.round(m.click_rate * 100) : 0,
        reply_rate: m.reply_rate ? Math.round(m.reply_rate * 100) : 0,
      };
    });

    return NextResponse.json({ rows }, { headers: { "content-type": "application/json" } });
  } catch (error: any) {
    console.error("Variant metrics error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch variant metrics" }, { status: 500 });
  }
}

