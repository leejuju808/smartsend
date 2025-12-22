import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Guard endpoint for per-campaign safety.
 * Input: { campaignId: string }
 * Output: { allowed, reason?, remainingToday, dailyCap }
 * - Auto-resets counters on day change and ramps daily_cap by ramp_step up to max_daily_cap.
 * - Blocks if bounce/compliant rates exceed thresholds in v_campaign_health.
 * - If allowed, reserves 1 send (increments today_count).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { campaignId } = await req.json();
    if (!campaignId) return NextResponse.json({ allowed: false, reason: "campaignId required" }, { status: 400 });

    // Load health row
    const { data: healths, error: hErr } = await supabase
      .from("v_campaign_health")
      .select("*")
      .eq("campaign_id", campaignId);
    if (hErr) throw hErr;
    const h = healths?.[0];
    if (!h) return NextResponse.json({ allowed: false, reason: "campaign not found" }, { status: 404 });

    // Load writable campaign row
    const { data: camp, error: cErr } = await supabase
      .from("campaigns").select("*").eq("id", campaignId).single();
    if (cErr) throw cErr;

    let { daily_cap, ramp_step, max_daily_cap, max_bounce_pct, max_complaint_pct, today_count, today_date, status } = camp;
    const todayISO = new Date().toISOString().slice(0, 10);

    // Daily reset & ramp
    if (today_date !== todayISO) {
      today_count = 0;
      today_date = todayISO;
      daily_cap = Math.min(daily_cap + ramp_step, max_daily_cap);
    }

    // If campaign is paused or completed, block
    if (status === "paused" || status === "completed") {
      await supabase.from("campaigns").update({
        today_count, today_date, daily_cap, updated_at: new Date().toISOString()
      }).eq("id", campaignId);
      return NextResponse.json({ allowed: false, reason: `campaign ${status}`, remainingToday: 0, dailyCap: daily_cap });
    }

    // Rate guards
    const bounceRate = Number(h.bounce_rate_7d || 0);
    const complaintRate = Number(h.complaint_rate_7d || 0);

    if (bounceRate >= Number(max_bounce_pct)) {
      await supabase.from("campaign_alerts").insert({
        campaign_id: campaignId,
        level: "error",
        code: "BOUNCE_SPIKE",
        message: `Paused: 7d bounce rate ${bounceRate}% ≥ ${max_bounce_pct}%`,
        meta: { bounceRate, max_bounce_pct }
      });
      await supabase.from("campaigns").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", campaignId);

      return NextResponse.json({ allowed: false, reason: "campaign_paused_bounce", remainingToday: 0, dailyCap: daily_cap });
    }

    if (complaintRate >= Number(max_complaint_pct)) {
      await supabase.from("campaign_alerts").insert({
        campaign_id: campaignId,
        level: "error",
        code: "COMPLAINT_SPIKE",
        message: `Paused: 7d complaint rate ${complaintRate}% ≥ ${max_complaint_pct}%`,
        meta: { complaintRate, max_complaint_pct }
      });
      await supabase.from("campaigns").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", campaignId);

      return NextResponse.json({ allowed: false, reason: "campaign_paused_complaint", remainingToday: 0, dailyCap: daily_cap });
    }

    // Daily cap guard
    if (today_count >= daily_cap) {
      await supabase.from("campaign_alerts").insert({
        campaign_id: campaignId,
        level: "warning",
        code: "DAILY_CAP_REACHED",
        message: "Daily cap reached",
        meta: { daily_cap, today_count }
      });
      await supabase.from("campaigns").update({
        today_count, today_date, daily_cap, updated_at: new Date().toISOString()
      }).eq("id", campaignId);

      return NextResponse.json({ allowed: false, reason: "daily_cap_reached", remainingToday: 0, dailyCap: daily_cap });
    }

    // Reserve slot
    today_count += 1;
    await supabase.from("campaigns").update({
      today_count, today_date, daily_cap, updated_at: new Date().toISOString()
    }).eq("id", campaignId);

    return NextResponse.json({
      allowed: true,
      reason: "ok",
      remainingToday: Math.max(daily_cap - today_count, 0),
      dailyCap: daily_cap
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ allowed: false, reason: e?.message || "Unknown error" }, { status: 500 });
  }
}
