import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { loadThreadForUser } from "../../_lib";

type SnoozeBody = {
  until?: string;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: cookieStore });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("snooze thread auth lookup failed", userError);
    return NextResponse.json({ error: "auth_lookup_failed" }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const threadId = params.id;
  if (!threadId) {
    return NextResponse.json({ error: "missing_thread_id" }, { status: 400 });
  }

  const payload = (await req.json().catch(() => ({}))) as SnoozeBody;
  if (!payload.until) {
    return NextResponse.json({ error: "until_required" }, { status: 400 });
  }

  const dueAt = new Date(payload.until);
  if (Number.isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: "invalid_until" }, { status: 400 });
  }

  const result = await loadThreadForUser(supabase, user.id, threadId);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  const { error: updateError } = await supabase
    .from("reply_threads")
    .update({ status: "snoozed" })
    .eq("id", threadId);

  if (updateError) {
    console.error("snooze thread update failed", updateError);
    return NextResponse.json({ error: "snooze_failed" }, { status: 500 });
  }

  const { error: taskError } = await supabase.from("reply_tasks").insert({
    account_id: result.thread.account_id,
    thread_id: threadId,
    title: "Follow up after snooze",
    due_at: dueAt.toISOString(),
    assignee_id: result.thread.owner_id,
  });

  if (taskError) {
    console.error("snooze task insert failed", taskError);
    return NextResponse.json({ error: "task_insert_failed" }, { status: 500 });
  }

  const { error: activityError } = await supabase.from("activities").insert({
    account_id: result.thread.account_id,
    lead_id: result.thread.lead_id,
    thread_id: threadId,
    campaign_id: result.thread.campaign_id,
    kind: "thread_snoozed",
    payload: {
      thread_id: threadId,
      until: dueAt.toISOString(),
      actor: user.id,
    },
  });

  if (activityError) {
    console.warn("snooze thread activity insert failed", activityError);
  }

  return NextResponse.json({ ok: true, until: dueAt.toISOString() });
}

