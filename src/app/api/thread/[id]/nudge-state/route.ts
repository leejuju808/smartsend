import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase";

type ThreadRecord = {
  id: string;
  campaign_id: string;
  needs_reply: boolean;
};

type RuleRecord = {
  enabled: boolean;
  labels: string[] | null;
  hours_wait: number;
  max_nudges: number;
};

type LastInboundRecord = {
  last_inbound_at: string | null;
  last_label: string | null;
};

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const threadId = params.id;
  const supabase = createAdminClient();

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id, campaign_id, needs_reply")
    .eq("id", threadId)
    .maybeSingle<ThreadRecord>();

  if (threadError) {
    return NextResponse.json({ error: threadError.message }, { status: 500 });
  }

  if (!thread) {
    return NextResponse.json({ needs: false }, { status: 404 });
  }

  if (!thread.needs_reply) {
    return NextResponse.json({ needs: false });
  }

  const { data: rule, error: ruleError } = await supabase
    .from("followup_rules")
    .select("enabled, labels, hours_wait, max_nudges")
    .eq("campaign_id", thread.campaign_id)
    .maybeSingle<RuleRecord>();

  if (ruleError) {
    return NextResponse.json({ error: ruleError.message }, { status: 500 });
  }

  if (!rule || !rule.enabled || (rule.max_nudges ?? 0) <= 0) {
    return NextResponse.json({ needs: false });
  }

  const { data: last, error: lastError } = await supabase
    .from("v_thread_last_inbound")
    .select("last_inbound_at, last_label")
    .eq("thread_id", threadId)
    .maybeSingle<LastInboundRecord>();

  if (lastError) {
    return NextResponse.json({ error: lastError.message }, { status: 500 });
  }

  if (!last?.last_inbound_at) {
    return NextResponse.json({ needs: false });
  }

  const labels = Array.isArray(rule.labels) ? rule.labels : [];
  if (labels.length && last.last_label && !labels.includes(last.last_label)) {
    return NextResponse.json({ needs: false });
  }

  const { data: nudgesRow } = await supabase
    .from("v_thread_nudges")
    .select("nudges")
    .eq("thread_id", threadId)
    .maybeSingle<{ nudges: number }>();

  const nudgesDone = nudgesRow?.nudges ?? 0;
  if (nudgesDone >= (rule.max_nudges ?? 0)) {
    return NextResponse.json({ needs: false });
  }

  const eligibleAt =
    new Date(last.last_inbound_at).getTime() +
    (rule.hours_wait ?? 48) * 60 * 60 * 1000;

  const { data: tasks, error: taskError } = await supabase
    .from("followup_tasks")
    .select("id, created_at, run_at, nudge_no, status")
    .eq("thread_id", threadId)
    .in("status", ["queued", "working"])
    .order("run_at", { ascending: true })
    .limit(1);

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }

  const task = tasks?.[0];
  if (task) {
    return NextResponse.json({
      needs: true,
      queued_at: task.created_at,
      run_at: task.run_at,
      nudge_no: task.nudge_no,
    });
  }

  const now = Date.now();
  if (eligibleAt <= now) {
    return NextResponse.json({ needs: true, in_hours: 0 });
  }

  const hoursUntil = Math.max(0, Math.ceil((eligibleAt - now) / (60 * 60 * 1000)));

  return NextResponse.json({
    needs: true,
    in_hours: hoursUntil,
  });
}


