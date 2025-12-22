import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type Campaign = {
  id: string;
  user_id: string;
  account_id: string | null;
  send_start: string | null;      // "09:00" (HH:mm) optional
  send_end: string | null;        // "17:00"
  timezone: string | null;        // e.g., "America/Los_Angeles"
  daily_cap: number | null;       // fallback to account.daily_cap
};

function nextWindowNow(tz?: string | null, start?: string | null, end?: string | null) {
  const now = new Date();
  if (!start || !end) return now; // no window limits
  // naive window check in local server time for MVP; refine with tz later
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = new Date(now); s.setHours(sh||9, sm||0, 0, 0);
  const e = new Date(now); e.setHours(eh||17, em||0, 0, 0);
  if (now < s) return s;
  if (now > e) { const t = new Date(s); t.setDate(t.getDate()+1); return t; }
  return now;
}

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Load campaign
  const { data: camp, error: cerr } = await supabase
    .from("campaigns")
    .select("id,user_id,account_id,send_start,send_end,timezone,daily_cap")
    .eq("id", params.id).single();
  if (cerr) return NextResponse.json({ error: cerr.message }, { status: 400 });
  if (camp.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Resolve account + caps (account_id is required for send_queue)
  if (!camp.account_id) {
    return NextResponse.json({ error: "Campaign must have an account_id set" }, { status: 400 });
  }

  const { data: canSendPlan, error: planErr } = await supabase.rpc("can_send_under_plan", { p_campaign: camp.id });
  if (planErr) {
    return NextResponse.json({ error: planErr.message ?? "Plan check failed" }, { status: 400 });
  }

  if (canSendPlan !== true) {
    return NextResponse.json(
      { ok: false, queued: 0, message: "Monthly send limit reached. Upgrade to send more." },
      { status: 402 }
    );
  }

  const { data: acct } = await supabase.from("connected_accounts")
    .select("id,daily_cap").eq("id", camp.account_id).maybeSingle();
  const dailyCap = camp.daily_cap ?? acct?.daily_cap ?? 40;

  // Find leads attached to campaign (not yet queued)
  const { data: leads, error: lerr } = await supabase
    .from("campaign_leads")
    .select("lead_id, leads!inner(id,user_id,email,domain)")
    .eq("campaign_id", camp.id);
  if (lerr) return NextResponse.json({ error: lerr.message }, { status: 400 });

  // Already queued lead ids
  const { data: existing } = await supabase
    .from("send_queue")
    .select("lead_id").eq("campaign_id", camp.id);
  const existingSet = new Set((existing ?? []).map(r => r.lead_id));

  const eligible = (leads ?? [])
    .map(r => r.lead_id)
    .filter(id => !existingSet.has(id));

  if (eligible.length === 0) {
    return NextResponse.json({ ok: true, queued: 0, message: "No new leads to queue" });
  }

  // Respect daily cap: only add up to remaining for today
  const today = new Date();
  const dayStart = new Date(today); dayStart.setHours(0,0,0,0);
  const dayEnd = new Date(today); dayEnd.setHours(23,59,59,999);

  const { data: sentToday } = await supabase
    .from("send_logs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", camp.id)
    .gte("created_at", dayStart.toISOString())
    .lte("created_at", dayEnd.toISOString());

  const used = (sentToday as any)?.length ? (sentToday as any).length : (sentToday?.count ?? 0);
  const remaining = Math.max(0, dailyCap - (typeof used === "number" ? used : 0));
  if (remaining === 0) {
    return NextResponse.json({ ok: true, queued: 0, message: "Daily cap reached" });
  }

  const toQueue = eligible.slice(0, remaining);
  const startAt = nextWindowNow(camp.timezone, camp.send_start, camp.send_end);

  const rows = toQueue.map((lead_id, i) => {
    // simple spread 30–60s apart to look human-ish
    const scheduled = new Date(startAt);
    scheduled.setSeconds(scheduled.getSeconds() + 45 * i);
    return {
      user_id: user.id,
      campaign_id: camp.id,
      lead_id,
      account_id: camp.account_id!, // Already validated above
      scheduled_at: scheduled.toISOString(),
      status: "pending" as const,
      step_no: 1,
      step_number: 1,
    };
  });

  const { error: qerr } = await supabase.from("send_queue").insert(rows);
  if (qerr) return NextResponse.json({ error: qerr.message }, { status: 400 });

  return NextResponse.json({ ok: true, queued: rows.length, start_at: startAt.toISOString() });
}

