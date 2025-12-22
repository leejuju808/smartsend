import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Guard endpoint to call right before queuing/sending any email.
 * Input: { senderEmail: string }
 * Returns: { allowed: boolean, reason?: string, remainingToday?: number, dailyCap?: number }
 *
 * Logic:
 *  - Auto reset daily counter on date change.
 *  - Auto-ramp daily_cap by ramp_step up to max_daily_cap (once per day).
 *  - Compute bounce_rate_7d from view v_sender_health; if >= max_bounce_pct -> pause and alert.
 *  - If sender paused or cap reached -> return allowed=false + alert recorded.
 *  - If allowed -> increment today_count (reserve a slot).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function upsertAlert(sender_id: string, level: "info" | "warning" | "error", code: string, message: string, meta?: any) {
  await supabase.from("sender_alerts").insert({
    sender_id,
    level,
    code,
    message,
    meta: meta ? JSON.stringify(meta) : null,
  });
}

export async function POST(req: Request) {
  try {
    const { senderEmail } = await req.json();
    if (!senderEmail) {
      return NextResponse.json({ allowed: false, reason: "senderEmail required" }, { status: 400 });
    }

    // 1) Load sender row + health (via view)
    const { data: healthRows, error: healthErr } = await supabase
      .from("v_sender_health")
      .select("*")
      .eq("sender_email", senderEmail.toLowerCase());

    if (healthErr) throw healthErr;

    if (!healthRows || healthRows.length === 0) {
      // Auto-provision a sender row if missing
      const { data: ins, error: insErr } = await supabase
        .from("senders")
        .insert({ email: senderEmail.toLowerCase() })
        .select("*")
        .single();
      if (insErr) throw insErr;
      // re-fetch health
      const { data: healthRows2, error: healthErr2 } = await supabase
        .from("v_sender_health")
        .select("*")
        .eq("sender_email", senderEmail.toLowerCase());
      if (healthErr2) throw healthErr2;
      healthRows!.push(...(healthRows2 || []));
    }

    const h = healthRows![0];
    if (!h) throw new Error("Failed to load sender health");

    // Fetch fresh sender row for updates
    const { data: senderRow, error: senderErr } = await supabase
      .from("senders")
      .select("*")
      .eq("id", h.sender_id)
      .single();
    if (senderErr) throw senderErr;

    const todayISO = new Date().toISOString().slice(0, 10);
    let today_count = senderRow.today_count as number;
    let today_date = senderRow.today_date as string;
    let daily_cap = senderRow.daily_cap as number;
    const ramp_step = senderRow.ramp_step as number;
    const max_daily_cap = senderRow.max_daily_cap as number;
    const max_bounce_pct = Number(senderRow.max_bounce_pct);
    const bounce_rate_7d = Number(h.bounce_rate_7d);
    let status = senderRow.status as string;

    // 2) Auto reset & ramp (once/day)
    if (today_date !== todayISO) {
      today_count = 0;
      today_date = todayISO;
      // gentle ramp upward
      daily_cap = Math.min(daily_cap + ramp_step, max_daily_cap);
    }

    // 3) Bounce guard: pause if >= threshold
    if (bounce_rate_7d >= max_bounce_pct && status !== "paused_bounce") {
      status = "paused_bounce";
      await upsertAlert(senderRow.id, "error", "BOUNCE_SPIKE",
        `Paused sending: 7d bounce rate ${bounce_rate_7d}% ≥ ${max_bounce_pct}%`,
        { bounce_rate_7d, max_bounce_pct }
      );
    }

    // 4) Capacity guard
    if (status !== "active") {
      // persist updates
      await supabase.from("senders").update({
        today_count,
        today_date,
        daily_cap,
        status,
        updated_at: new Date().toISOString()
      }).eq("id", senderRow.id);

      return NextResponse.json({
        allowed: false,
        reason: `sender is ${status}`,
        remainingToday: Math.max(daily_cap - today_count, 0),
        dailyCap: daily_cap
      });
    }

    if (today_count >= daily_cap) {
      await upsertAlert(senderRow.id, "warning", "DAILY_CAP_REACHED",
        `Daily cap reached for ${senderEmail}`, { daily_cap, today_count }
      );

      // persist updates
      await supabase.from("senders").update({
        today_count,
        today_date,
        daily_cap,
        updated_at: new Date().toISOString()
      }).eq("id", senderRow.id);

      return NextResponse.json({
        allowed: false,
        reason: "daily_cap_reached",
        remainingToday: 0,
        dailyCap: daily_cap
      });
    }

    // 5) Reserve a slot (increment counter)
    today_count += 1;
    await supabase.from("senders").update({
      today_count,
      today_date,
      daily_cap,
      updated_at: new Date().toISOString()
    }).eq("id", senderRow.id);

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
