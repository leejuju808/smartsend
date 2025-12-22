import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ---------- Tunables (edit to taste) ----------
const RAMP_STAGES = [25, 50, 100, 200, 400]; // max sends/day per stage
const MIN_DAYS_PER_STAGE = 3;                 // minimum days before promotion
const PROMOTION_BOUNCE_CEILING = 0.02;        // < 2% 30d bounce to promote
const SOFT_FAIL_BOUNCE = 0.05;                // >=5% → freeze at current stage
const HARD_FAIL_BOUNCE = 0.08;                // >=8% → downgrade one stage
// ----------------------------------------------

function pct(n: number, d: number) {
  return d <= 0 ? 0 : n / d;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sender = String(body.from_address || "").toLowerCase();

    if (!sender) {
      return NextResponse.json(
        { error: "from_address is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1) Ensure sender row exists
    const { data: existing } = await supabase
      .from("senders")
      .select("*")
      .eq("from_address", sender)
      .maybeSingle();

    let senderRow = existing;

    if (!senderRow) {
      const { data: inserted, error: insErr } = await supabase
        .from("senders")
        .insert({
          from_address: sender,
          ramp_stage: 0,
          daily_limit: RAMP_STAGES[0],
          health_status: "green",
        })
        .select("*")
        .single();
      if (insErr) throw insErr;
      senderRow = inserted;
    }

    // 2) Compute last-7d, last-30d metrics from email_events
    const { data: m30, error: m30Err } = await supabase
      .rpc("sender_metrics_window", {
        p_from_address: sender,
        p_days_back: 30,
      });
    if (m30Err) throw m30Err;

    const { data: m7, error: m7Err } = await supabase
      .rpc("sender_metrics_window", {
        p_from_address: sender,
        p_days_back: 7,
      });
    if (m7Err) throw m7Err;

    const sent30 = m30?.[0]?.sent || 0;
    const bounced30 = m30?.[0]?.bounced || 0;
    const sentToday = m7?.[0]?.sent_today || 0; // function returns today count too
    const bounceRate30 = pct(bounced30, sent30);

    let stage: number = senderRow.ramp_stage ?? 0;
    let limit = RAMP_STAGES[stage] ?? RAMP_STAGES[RAMP_STAGES.length - 1];
    const reasons: string[] = [];

    // 3) Evaluate promotions/demotions
    const daysInStage = senderRow.days_in_stage ?? 0;

    if (bounceRate30 >= HARD_FAIL_BOUNCE && stage > 0) {
      stage = Math.max(0, stage - 1);
      reasons.push(
        `Hard fail: 30d bounce ${(bounceRate30 * 100).toFixed(
          1
        )}% ≥ ${(HARD_FAIL_BOUNCE * 100).toFixed(0)}% → downgrade`
      );
    } else if (bounceRate30 >= SOFT_FAIL_BOUNCE) {
      // Freeze: do not promote, keep stage/limit as-is
      reasons.push(
        `Soft fail: 30d bounce ${(bounceRate30 * 100).toFixed(
          1
        )}% ≥ ${(SOFT_FAIL_BOUNCE * 100).toFixed(0)}% → freeze stage`
      );
    } else {
      // Candidate for promotion if low bounce & enough time/activity
      const canPromote =
        daysInStage >= MIN_DAYS_PER_STAGE && m7?.[0]?.sent >= 50; // at least 50 sends last 7d
      if (canPromote && stage < RAMP_STAGES.length - 1) {
        stage += 1;
        reasons.push(
          `Promote: low bounces & activity OK (≥50 in 7d, ≥${MIN_DAYS_PER_STAGE} days in stage)`
        );
      }
    }

    limit = RAMP_STAGES[stage];

    // 4) Health color
    let health: "green" | "yellow" | "red" = "green";
    if (bounceRate30 >= SOFT_FAIL_BOUNCE && bounceRate30 < HARD_FAIL_BOUNCE) {
      health = "yellow";
    } else if (bounceRate30 >= HARD_FAIL_BOUNCE) {
      health = "red";
    }

    // 5) Are we allowed to send another email right now?
    const allowed = sentToday < limit;

    // 6) Persist updates back to sender row
    const { error: updErr } = await supabase
      .from("senders")
      .update({
        ramp_stage: stage,
        daily_limit: limit,
        health_status: health,
        bounce_rate_30d: bounceRate30,
        sent_today: sentToday,
        last_checked_at: new Date().toISOString(),
        last_reasons: reasons.slice(0, 3),
      })
      .eq("from_address", sender);
    if (updErr) throw updErr;

    return NextResponse.json({
      ok: true,
      from_address: sender,
      allowed_to_send: allowed,
      today_sent: sentToday,
      today_limit: limit,
      ramp_stage: stage,
      health,
      bounce_rate_30d: Number(bounceRate30.toFixed(4)),
      reasons,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}