import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

function authorize(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  return key && key === process.env.CRON_SECRET;
}

function monthStartUtc(d: Date) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
  return dt;
}

function addMonthsUtc(d: Date, months: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

/**
 * POST /api/cron/flywheel
 *
 * Runs the SmartSend compounding flywheel:
 * - daily rollup (subject/time/city)
 * - proof-based volume scaling
 * - monthly auto-carry (best template becomes default; worst demoted)
 *
 * Auth: ?key=$CRON_SECRET
 */
export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const nowIso = now.toISOString();

  // 1) Daily rollup (yesterday UTC)
  let rollupRows = 0;
  try {
    const { data, error } = await supabaseAdmin.rpc("ss_flywheel_rollup_day", {});
    if (error) {
      console.error("[flywheel] ss_flywheel_rollup_day error", error);
    } else if (typeof data === "number") {
      rollupRows = data;
    }
  } catch (e) {
    console.error("[flywheel] ss_flywheel_rollup_day exception", e);
  }

  // 2) Volume scaling (all orgs; safe bounds are in SQL defaults)
  let scaledCampaigns = 0;
  try {
    const { data, error } = await supabaseAdmin.rpc("ss_flywheel_apply_volume_scaling", {});
    if (error) {
      console.error("[flywheel] ss_flywheel_apply_volume_scaling error", error);
    } else if (typeof data === "number") {
      scaledCampaigns = data;
    }
  } catch (e) {
    console.error("[flywheel] ss_flywheel_apply_volume_scaling exception", e);
  }

  // 3) Monthly carry (run once on the 1st of the month UTC; compute last month’s winners)
  let carryRows = 0;
  try {
    const ms = monthStartUtc(now);
    const isFirstDayUtc = now.getUTCDate() === 1;
    if (isFirstDayUtc) {
      const lastMonthStart = addMonthsUtc(ms, -1);
      const monthStr = lastMonthStart.toISOString().slice(0, 10); // YYYY-MM-01
      const { data, error } = await supabaseAdmin.rpc("ss_flywheel_compute_monthly_carry", {
        p_month: monthStr,
      });
      if (error) {
        console.error("[flywheel] ss_flywheel_compute_monthly_carry error", error);
      } else if (typeof data === "number") {
        carryRows = data;
      }
    }
  } catch (e) {
    console.error("[flywheel] ss_flywheel_compute_monthly_carry exception", e);
  }

  return NextResponse.json({
    ok: true,
    ran_at: nowIso,
    rollup_rows: rollupRows,
    scaled_campaigns: scaledCampaigns,
    monthly_carry_rows: carryRows,
  });
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}





