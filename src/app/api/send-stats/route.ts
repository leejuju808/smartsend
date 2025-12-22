import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  const since24h = new Date(Date.now()-24*3600e3).toISOString();

  // Queue stats grouped by status
  const { data: q1 } = await supabase
    .from("send_queue")
    .select("status")
    .or(`run_at.gte.${since24h},run_at.is.null`);

  // Logs stats grouped by status
  const { data: q2 } = await supabase
    .from("send_logs")
    .select("status")
    .gte("created_at", since24h);

  // Provider events grouped by kind
  const { data: ev } = await supabase
    .from("provider_events")
    .select("kind")
    .gte("created_at", since24h);

  // Aggregate counts
  const queueStats = (q1 || []).reduce((acc: any, row: any) => {
    const status = row.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const logStats = (q2 || []).reduce((acc: any, row: any) => {
    const status = row.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const eventStats = (ev || []).reduce((acc: any, row: any) => {
    const kind = row.kind || 'unknown';
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, {});

  // Format as arrays for the widget
  const queue = Object.entries(queueStats).map(([status, count]) => ({ status, count }));
  const logs = Object.entries(logStats).map(([status, count]) => ({ status, count }));
  const events = Object.entries(eventStats).map(([kind, count]) => ({ kind, count }));

  return NextResponse.json({ queue, logs, events }, { headers: { "content-type": "application/json" } });
}

