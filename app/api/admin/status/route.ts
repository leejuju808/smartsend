import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { LAUNCH_MODE, LAUNCH_TARGETS } from "@/lib/launch-mode";
import { cookies } from "next/headers";

const FOUNDER_EMAIL = "julian@smartsendhq.com";

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single();
  if (profile?.email !== FOUNDER_EMAIL) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createServiceClient();

  const cookieStore = await cookies();
  const builderLockCookie = cookieStore.get("builder_lock_until")?.value ?? null;
  const scriptPinnedCookie = cookieStore.get("sales_script_pinned_until")?.value ?? null;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  // Monday-start week (0=Sun)
  const day = startOfWeek.getDay();
  const diffToMonday = (day + 6) % 7;
  startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);

  const todayIso = startOfToday.toISOString();
  const weekIso = startOfWeek.toISOString();

  const [
    { count: activeCompanies },
    { count: activeSubs },
    { count: founderWorkspaces },
    { data: dl },
    { data: msgs },
    { data: todayDelivery },
    { data: weekDelivery },
    { data: todayReplies },
    { data: weekReplies },
    { data: todaySalesLeads },
    { data: weekSalesLeads },
    { data: mrrRows },
    { data: existingExecLog },
  ] = await Promise.all([
    admin.from("roofing_companies").select("id", { count: "exact", head: true }).eq("is_active", true),
    admin
      .from("company_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    admin.from("workspaces").select("id", { count: "exact", head: true }).eq("is_founder", true),
    admin
      .from("delivery_logs")
      .select("status, created_at")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(50000),
    admin
      .from("messages")
      .select("created_at, sent_at")
      .not("sent_at", "is", null)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(50000),
    // Scoreboard: outbound emails (delivery_logs message_type='outreach' and status='sent')
    admin
      .from("delivery_logs")
      .select("id, status, message_type, created_at")
      .eq("message_type", "outreach")
      .eq("status", "sent")
      .gte("created_at", todayIso)
      .limit(50000),
    admin
      .from("delivery_logs")
      .select("id, status, message_type, created_at")
      .eq("message_type", "outreach")
      .eq("status", "sent")
      .gte("created_at", weekIso)
      .limit(50000),
    // Replies received (inbound_messages)
    admin
      .from("inbound_messages")
      .select("id, created_at")
      .gte("created_at", todayIso)
      .limit(50000),
    admin
      .from("inbound_messages")
      .select("id, created_at")
      .gte("created_at", weekIso)
      .limit(50000),
    // Demos/trials/paid via sales_leads updated_at
    admin
      .from("sales_leads")
      .select("id, status, updated_at")
      .gte("updated_at", todayIso)
      .limit(50000),
    admin
      .from("sales_leads")
      .select("id, status, updated_at")
      .gte("updated_at", weekIso)
      .limit(50000),
    admin.from("admin_mrr").select("mrr").limit(50000),
    admin.from("execution_logs").select("*").eq("date", startOfToday.toISOString().slice(0, 10)).maybeSingle(),
  ]);

  const totalFounderSlots = 10;
  const foundersUsed = founderWorkspaces ?? 0;
  const founderSlotsRemaining = Math.max(totalFounderSlots - foundersUsed, 0);

  const delivery = dl ?? [];
  const totalSends = delivery.length;
  const failedSends = delivery.filter((r: any) => ["error", "bounced", "spam"].includes(r.status)).length;
  const sendFailureRate = totalSends > 0 ? failedSends / totalSends : null;

  const m = msgs ?? [];
  const avgSendMs =
    m.length > 0
      ? Math.round(
          m.reduce((sum: number, r: any) => {
            const a = Date.parse(r.created_at);
            const b = Date.parse(r.sent_at);
            return sum + (isFinite(a) && isFinite(b) ? Math.max(b - a, 0) : 0);
          }, 0) / m.length
        )
      : null;

  const emailsToday = (todayDelivery ?? []).length;
  const emailsWeek = (weekDelivery ?? []).length;
  const repliesToday = (todayReplies ?? []).length;
  const repliesWeek = (weekReplies ?? []).length;

  const salesToday = todaySalesLeads ?? [];
  const salesWeek = weekSalesLeads ?? [];
  const demosToday = salesToday.filter((r: any) => r.status === "demo_booked").length;
  const trialsToday = salesToday.filter((r: any) => r.status === "trial").length;
  const paidToday = salesToday.filter((r: any) => r.status === "paid").length;
  const demosWeek = salesWeek.filter((r: any) => r.status === "demo_booked").length;
  const trialsWeek = salesWeek.filter((r: any) => r.status === "trial").length;
  const paidWeek = salesWeek.filter((r: any) => r.status === "paid").length;

  const mrr = (mrrRows ?? []).reduce((s: number, r: any) => s + (r?.mrr || 0), 0);

  // Ensure today's execution log exists (auto-filled once).
  const todayDate = startOfToday.toISOString().slice(0, 10); // YYYY-MM-DD
  let execLog = existingExecLog ?? null;
  if (!execLog) {
    const { data: inserted } = await admin
      .from("execution_logs")
      .insert({
        date: todayDate,
        emails_sent: emailsToday,
        demos_booked: demosToday,
        trials_started: trialsToday,
        paid_conversions: paidToday,
      })
      .select("*")
      .single();
    execLog = inserted ?? null;
  }

  const activityTotalToday = emailsToday + repliesToday + demosToday + trialsToday + paidToday;
  const executionMissed = activityTotalToday === 0;

  // Missed streak (last 3 days). If a day has no row, treat as missed.
  const missedDates: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(startOfToday);
    d.setDate(d.getDate() - i);
    missedDates.push(d.toISOString().slice(0, 10));
  }
  const { data: lastLogs } = await admin
    .from("execution_logs")
    .select("date, emails_sent, demos_booked, trials_started, paid_conversions")
    .in("date", missedDates);

  const byDate = new Map<string, any>((lastLogs ?? []).map((r: any) => [r.date, r]));
  let missedStreak = 0;
  for (const d of missedDates) {
    const row = byDate.get(d);
    const total =
      row == null
        ? 0
        : (row.emails_sent ?? 0) +
          (row.demos_booked ?? 0) +
          (row.trials_started ?? 0) +
          (row.paid_conversions ?? 0);
    if (total === 0) missedStreak++;
    else break;
  }

  // Auto-enforce no-excuse lock if missed streak hits 3.
  const nowMs = now.getTime();
  const builderLockedAlready = (() => {
    if (!builderLockCookie) return false;
    const t = Date.parse(builderLockCookie);
    return isFinite(t) && t > nowMs;
  })();

  const shouldForceNoExcuse = missedStreak >= 3 && !builderLockedAlready;
  const lockUntil = shouldForceNoExcuse ? new Date(nowMs + 48 * 60 * 60 * 1000) : null;

  const res = NextResponse.json({
    launch: {
      launchMode: LAUNCH_MODE,
      targets: LAUNCH_TARGETS,
    },
    execution: {
      today: {
        date: todayDate,
        emailsSent: emailsToday,
        repliesReceived: repliesToday,
        demosBooked: demosToday,
        trialsStarted: trialsToday,
        paidConversions: paidToday,
        mrr,
      },
      week: {
        startDate: startOfWeek.toISOString().slice(0, 10),
        emailsSent: emailsWeek,
        repliesReceived: repliesWeek,
        demosBooked: demosWeek,
        trialsStarted: trialsWeek,
        paidConversions: paidWeek,
        mrr,
      },
      executionMissed,
      missedStreak,
      log: execLog,
      noExcuse: {
        forced: missedStreak >= 3,
        builderLockUntil: builderLockCookie || lockUntil?.toISOString() || null,
        salesScriptPinnedUntil: scriptPinnedCookie || lockUntil?.toISOString() || null,
      },
    },
    activeCompanies: activeCompanies ?? 0,
    activeSubscriptions: activeSubs ?? 0,
    founderSlotsRemaining,
    sendFailureRate,
    avgSendTimeMs: avgSendMs,
    windows: {
      deliveryLogsDays: 7,
      messagesHours: 24,
    },
  });
  if (shouldForceNoExcuse && lockUntil) {
    res.cookies.set("builder_lock_until", lockUntil.toISOString(), {
      path: "/",
      maxAge: 48 * 60 * 60,
      httpOnly: false,
      sameSite: "lax",
    });
    res.cookies.set("sales_script_pinned_until", lockUntil.toISOString(), {
      path: "/",
      maxAge: 48 * 60 * 60,
      httpOnly: false,
      sameSite: "lax",
    });
  }
  return res;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single();
  if (profile?.email !== FOUNDER_EMAIL) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as any;
  const action = body?.action as string | undefined;
  const admin = createServiceClient();

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayDate = today.toISOString().slice(0, 10);

  if (action === "save_notes") {
    const notes = typeof body?.notes === "string" ? body.notes : "";
    const { data, error } = await admin
      .from("execution_logs")
      .upsert({ date: todayDate, notes }, { onConflict: "date" })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, log: data });
  }

  if (action === "start_sales_session") {
    const endsAt = new Date(now.getTime() + 60 * 60 * 1000);
    const res = NextResponse.json({
      ok: true,
      session: { startedAt: now.toISOString(), endsAt: endsAt.toISOString() },
    });
    res.cookies.set("sales_session", JSON.stringify({ startedAt: now.toISOString(), endsAt: endsAt.toISOString() }), {
      path: "/",
      maxAge: 60 * 60,
      httpOnly: false,
      sameSite: "lax",
    });
    return res;
  }

  if (action === "end_sales_session") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set("sales_session", "", { path: "/", maxAge: 0 });
    return res;
  }

  if (action === "apply_no_excuse_lock") {
    // 48h builder lock (cookie-based; enforced in middleware)
    const until = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const res = NextResponse.json({ ok: true, builderLockUntil: until.toISOString() });
    res.cookies.set("builder_lock_until", until.toISOString(), {
      path: "/",
      maxAge: 48 * 60 * 60,
      httpOnly: false,
      sameSite: "lax",
    });
    res.cookies.set("sales_script_pinned_until", until.toISOString(), {
      path: "/",
      maxAge: 48 * 60 * 60,
      httpOnly: false,
      sameSite: "lax",
    });
    return res;
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}










