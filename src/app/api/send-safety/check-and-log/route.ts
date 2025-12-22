import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function effectiveCap(
  warmupStart: string,
  startCap: number,
  maxCap: number,
  step: number,
  todayISO: string
) {
  const start = new Date(warmupStart + "T00:00:00Z");
  const today = new Date(todayISO);
  const diffDays = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000));
  return Math.min(maxCap, startCap + diffDays * step);
}

export async function POST(req: NextRequest) {
  try {
    const { sender_email, recipient_email, campaign_id } = await req.json();
    if (!sender_email || !recipient_email) {
      return NextResponse.json({ error: "sender_email and recipient_email are required" }, { status: 400 });
    }

    // 1) load policy + today stats
    const { data: pol } = await supabase
      .from("send_policies")
      .select("*")
      .eq("sender_email", sender_email)
      .maybeSingle();

    // bootstrap default if missing
    let policy = pol;
    if (!policy) {
      const { data: inserted, error: insErr } = await supabase
        .from("send_policies")
        .insert({
          sender_email,
          daily_cap_start: 25,
          daily_cap_max: 200,
          daily_cap_step: 25,
          warmup_start_date: new Date().toISOString().slice(0, 10)
        })
        .select("*")
        .single();
      if (insErr) throw insErr;
      policy = inserted;
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: stats, error: stErr } = await supabase
      .from("sender_stats_daily")
      .select("*")
      .eq("sender_email", sender_email)
      .eq("day", today)
      .maybeSingle();
    if (stErr) throw stErr;

    const cap = effectiveCap(
      policy.warmup_start_date,
      policy.daily_cap_start,
      policy.daily_cap_max,
      policy.daily_cap_step,
      new Date().toISOString()
    );

    const sendsToday = stats?.sends ?? 0;

    // 2) quick health read (view)
    const { data: health } = await supabase
      .from("sender_health_today")
      .select("*")
      .eq("sender_email", sender_email)
      .maybeSingle();

    // 3) decision
    let allowed = true;
    let reason: string | null = null;

    if (policy.paused) {
      allowed = false;
      reason = "paused";
    } else if (sendsToday >= cap) {
      allowed = false;
      reason = "daily_cap_reached";
    } else if (health?.health_color === "red") {
      allowed = false;
      reason = "bounce_guard";
    }

    // 4) log attempt (always log)
    await supabase.from("send_attempts").insert({
      sender_email,
      recipient_email,
      campaign_id: campaign_id ?? null
    });

    return NextResponse.json({
      allowed,
      reason,
      cap,
      sends_today: sendsToday,
      health_color: health?.health_color ?? "green"
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message ?? "send safety failed" }, { status: 500 });
  }
}
