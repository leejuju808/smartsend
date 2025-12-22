import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function toLocal(date: Date, tz: string) {
  // Quick local hour via Intl (no heavy deps)
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  const hour = Number(parts.hour);
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;
  return { hour, ymd };
}

export async function POST() {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Pull all policies + account metadata (workspace_id for suppression scope)
  const { data: accounts, error: aErr } = await supa
    .from("connected_accounts")
    .select("id, workspace_id, provider, email, sending_policies!inner(timezone,daily_cap,hourly_cap,warmup_enabled,warmup_day_1,warmup_growth,quiet_hours_start,quiet_hours_end,send_weekends)");
  if (aErr) return new NextResponse(aErr.message, { status: 500 });

  let allowed = 0;

  for (const row of accounts ?? []) {
    const pol = (row as any).sending_policies;
    const now = new Date();
    const { hour, ymd } = toLocal(now, pol.timezone);

    // weekend check
    const dow = new Intl.DateTimeFormat("en-US", { timeZone: pol.timezone, weekday: "short" }).format(now);
    const isWeekend = dow === "Sat" || dow === "Sun";
    if (!pol.send_weekends && isWeekend) continue;

    // quiet hours check
    const hs = Number(pol.quiet_hours_start);
    const he = Number(pol.quiet_hours_end);
    const inQuiet = hs < he ? (hour >= hs && hour < he) : (hour >= hs || hour < he);
    if (inQuiet) continue;

    // resolve counters
    const { data: hourly } = await supa
      .from("send_counters")
      .select("sent")
      .eq("account_id", row.id).eq("ymd", ymd).eq("hour", hour).maybeSingle();

    const { data: dailyRows } = await supa
      .from("send_counters")
      .select("sent")
      .eq("account_id", row.id).eq("ymd", ymd);

    const hourSent = hourly?.sent ?? 0;
    const daySent = (dailyRows ?? []).reduce((s, r) => s + r.sent, 0);

    // warmup cap
    let warmupCap = pol.daily_cap;
    if (pol.warmup_enabled) {
      // Determine warmup day n = number of distinct ymd rows ever + 1; simple heuristic
      const { data: daysEver } = await supa
        .from("send_counters")
        .select("ymd")
        .eq("account_id", row.id)
        .order("ymd", { ascending: true });
      const dayN = Array.from(new Set((daysEver ?? []).map(d => d.ymd))).length + 1;
      warmupCap = Math.min(pol.daily_cap, pol.warmup_day_1 + Math.max(0, dayN - 1) * pol.warmup_growth);
    }

    const dayRemaining = Math.max(0, warmupCap - daySent);
    const hourRemaining = Math.max(0, pol.hourly_cap - hourSent);
    const grant = Math.min(dayRemaining, hourRemaining, 10); // send up to 10 per tick per account
    if (grant <= 0) continue;

    // dequeue from outbox respecting suppression
    const { data: queue } = await supa
      .from("outbox")
      .select("id, to_email, account_id, lead_id, status, created_at")
      .eq("account_id", row.id)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(grant * 3); // overfetch to filter suppression

    if (!queue?.length) continue;

    // fetch suppression emails
    const emails = Array.from(new Set(queue.map(q => q.to_email.toLowerCase())));
    const { data: suppressed } = await supa
      .from("suppression")
      .select("email")
      .eq("workspace_id", (row as any).workspace_id)
      .in("email", emails);

    const suppressedSet = new Set((suppressed ?? []).map(s => s.email.toLowerCase()));

    let allowedThisAccount = 0;

    for (const job of queue) {
      if (allowedThisAccount >= grant) break;
      if (suppressedSet.has(job.to_email.toLowerCase())) {
        // cancel suppressed
        await supa.from("outbox").update({ status: "failed", last_error: "suppressed" }).eq("id", job.id);
        continue;
      }
      // unlock for sender: flip to queued (already), we just bump to a short window by setting created_at older? 
      // Easiest: move to a transient "ready" state; your sender picks queued OR ready.
      await supa.from("outbox").update({ status: "queued" }).eq("id", job.id); // keep as queued
      allowedThisAccount++;
    }

    // write counters
    if (allowedThisAccount > 0) {
      const { data: cur } = await supa
        .from("send_counters")
        .select("sent")
        .eq("account_id", row.id).eq("ymd", ymd).eq("hour", hour).maybeSingle();

      if (cur) {
        await supa.from("send_counters").update({ sent: cur.sent + allowedThisAccount })
          .eq("account_id", row.id).eq("ymd", ymd).eq("hour", hour);
      } else {
        await supa.from("send_counters").insert({
          account_id: row.id, ymd, hour, sent: allowedThisAccount
        });
      }
      allowed += allowedThisAccount;
    }
  }

  return NextResponse.json({ allowed });
}

