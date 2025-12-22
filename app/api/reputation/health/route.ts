import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type MetricRow = {
  email: string;
  date: string;
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  bounced: number;
  complaints: number;
};

type HealthRow = {
  email: string;
  account_id: string;
  reputation_score: number;
  send_limit: number;
  paused: boolean;
  last_update: string;
};

const WINDOW_DAYS = 7;

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

function computeScore(m: MetricRow) {
  const openRate = m.delivered > 0 ? m.opened / m.delivered : 0;
  const replyRate = m.delivered > 0 ? m.replied / m.delivered : 0;
  const bounceRate = m.sent > 0 ? m.bounced / m.sent : 0;
  const complaintRate = m.sent > 0 ? m.complaints / m.sent : 0;

  const score =
    100 -
    50 * bounceRate -
    40 * complaintRate +
    10 * openRate +
    10 * replyRate;

  return clampScore(score);
}

function aggregateWindow(metrics: MetricRow[]) {
  return metrics.reduce(
    (acc, cur) => {
      acc.sent += cur.sent;
      acc.delivered += cur.delivered;
      acc.opened += cur.opened;
      acc.replied += cur.replied;
      acc.bounced += cur.bounced;
      acc.complaints += cur.complaints;
      return acc;
    },
    {
      sent: 0,
      delivered: 0,
      opened: 0,
      replied: 0,
      bounced: 0,
      complaints: 0,
    }
  );
}

function formatStatus(score: number, paused: boolean) {
  if (paused) {
    return { emoji: "🔴", label: "Paused" };
  }
  if (score >= 90) {
    return { emoji: "🟢", label: "Healthy" };
  }
  if (score >= 60) {
    return { emoji: "🟡", label: "Monitor" };
  }
  return { emoji: "🟠", label: "At Risk" };
}

function isoDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (WINDOW_DAYS - 1));

  const { data: healthRows, error: healthError } = await supabase
    .from("mailbox_health")
    .select("email, account_id, reputation_score, send_limit, paused, last_update")
    .eq("account_id", user.id)
    .order("reputation_score", { ascending: false });

  if (healthError) {
    return NextResponse.json({ error: healthError.message }, { status: 500 });
  }

  if (!healthRows?.length) {
    return NextResponse.json({ mailboxes: [] });
  }

  const { data: metricRows, error: metricsError } = await supabase
    .from("mailbox_metrics")
    .select("email, date, sent, delivered, opened, replied, bounced, complaints")
    .eq("account_id", user.id)
    .gte("date", isoDateOnly(start))
    .lte("date", isoDateOnly(today))
    .order("date", { ascending: true });

  if (metricsError) {
    return NextResponse.json({ error: metricsError.message }, { status: 500 });
  }

  const metricsByEmail = new Map<string, MetricRow[]>();
  for (const row of metricRows ?? []) {
    const list = metricsByEmail.get(row.email) ?? [];
    list.push(row as MetricRow);
    metricsByEmail.set(row.email, list);
  }

  const days: string[] = [];
  for (let i = 0; i < WINDOW_DAYS; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push(isoDateOnly(d));
  }

  const mailboxes = (healthRows as HealthRow[]).map((row) => {
    const rows = metricsByEmail.get(row.email) ?? [];
    const indexed = new Map(rows.map((r) => [r.date, r]));
    const trend = days.map((day) => {
      const metric =
        indexed.get(day) ??
        ({
          email: row.email,
          date: day,
          sent: 0,
          delivered: 0,
          opened: 0,
          replied: 0,
          bounced: 0,
          complaints: 0,
        } as MetricRow);
      return { date: day, score: computeScore(metric) };
    });

    const windowAggregate = aggregateWindow(rows);
    const openRate =
      windowAggregate.delivered > 0
        ? windowAggregate.opened / windowAggregate.delivered
        : 0;
    const replyRate =
      windowAggregate.delivered > 0
        ? windowAggregate.replied / windowAggregate.delivered
        : 0;
    const bounceRate =
      windowAggregate.sent > 0
        ? windowAggregate.bounced / windowAggregate.sent
        : 0;
    const complaintRate =
      windowAggregate.sent > 0
        ? windowAggregate.complaints / windowAggregate.sent
        : 0;

    const status = formatStatus(row.reputation_score, row.paused);

    return {
      email: row.email,
      reputation_score: row.reputation_score,
      send_limit: row.send_limit,
      paused: row.paused,
      last_update: row.last_update,
      status,
      metrics: {
        open_rate: openRate,
        reply_rate: replyRate,
        bounce_rate: bounceRate,
        complaint_rate: complaintRate,
        window: windowAggregate,
      },
      trend,
    };
  });

  return NextResponse.json({ mailboxes });
}







