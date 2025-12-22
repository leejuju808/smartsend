import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createHash } from "crypto";

const SEND_NOW_ENDPOINT = process.env.SB_FUN_SEND_NOW ?? process.env.SEND_NOW_URL ?? null;

function hashKey(threadId: string, nudgeNo: number, subject: string, body: string) {
  return createHash("sha256")
    .update(`${threadId}:${nudgeNo}:${subject}:${body}`)
    .digest("hex");
}

type FollowupActionRequest = {
  action?: "skip" | "send_now";
  task_id?: string;
  draft_id?: string | null;
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const threadId = params.id;
  if (!threadId) {
    return NextResponse.json({ error: "thread id required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id, campaign_id, lead_id")
    .eq("id", threadId)
    .maybeSingle();

  if (threadError) {
    return NextResponse.json({ error: threadError.message }, { status: 400 });
  }

  if (!thread) {
    return NextResponse.json({ error: "thread not found" }, { status: 404 });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, user_id")
    .eq("id", thread.campaign_id)
    .maybeSingle();

  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 400 });
  }

  let allowed = campaign?.user_id === user.id;
  if (!allowed) {
    const { data: membership } = await supabase
      .from("campaign_members")
      .select("user_id")
      .eq("campaign_id", thread.campaign_id)
      .eq("user_id", user.id)
      .maybeSingle();
    allowed = !!membership;
  }

  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: FollowupActionRequest;
  try {
    payload = await req.json();
  } catch (err) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!payload.task_id) {
    return NextResponse.json({ error: "task_id required" }, { status: 400 });
  }

  if (payload.action === "skip") {
    // BLOCK 269600 — SmartSend Enforcement Sprint:
    // Follow-ups cannot be disabled/skipped by users.
    return NextResponse.json(
      { error: "Follow-ups are mandatory and cannot be skipped." },
      { status: 403 }
    );
  }

  if (payload.action === "send_now") {
    if (!SEND_NOW_ENDPOINT) {
      return NextResponse.json({ error: "send-now endpoint not configured" }, { status: 500 });
    }

    const { data: task, error: taskError } = await supabaseAdmin
      .from("followup_tasks")
      .select("id, campaign_id, thread_id, lead_id, last_inbound_id, nudge_no, meta")
      .eq("id", payload.task_id)
      .eq("thread_id", threadId)
      .maybeSingle();

    if (taskError) {
      return NextResponse.json({ error: taskError.message }, { status: 400 });
    }

    if (!task) {
      return NextResponse.json({ error: "task not found" }, { status: 404 });
    }

    const { data: draft, error: draftError } = payload.draft_id
      ? await supabaseAdmin
          .from("reply_drafts")
          .select("id, subject, body, meta, campaign_id, thread_id, lead_id")
          .eq("id", payload.draft_id)
          .maybeSingle()
      : await supabaseAdmin
          .from("reply_drafts")
          .select("id, subject, body, meta, campaign_id, thread_id, lead_id")
          .eq("thread_id", threadId)
          .contains("meta", { kind: "followup" })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

    if (draftError) {
      return NextResponse.json({ error: draftError.message }, { status: 400 });
    }

    if (!draft) {
      return NextResponse.json({ error: "no follow-up draft available" }, { status: 404 });
    }

    const { data: campaignRow, error: campError } = await supabaseAdmin
      .from("campaigns")
      .select("id, from_account_id")
      .eq("id", task.campaign_id)
      .maybeSingle();

    if (campError) {
      return NextResponse.json({ error: campError.message }, { status: 400 });
    }

    if (!campaignRow?.from_account_id) {
      return NextResponse.json({ error: "campaign missing from_account_id" }, { status: 400 });
    }

    const subject = draft.subject ?? "Quick follow-up";
    const body = draft.body ?? "Just checking in on my last note.";
    const jitterSeconds = Math.floor(Math.random() * 8 * 60);
    const nudgeNo = task.nudge_no ?? 0;
    const idempotencyKey = hashKey(threadId, nudgeNo, subject ?? "", body ?? "");

    const { error: attemptError } = await supabaseAdmin.from("send_attempts").insert({
      idempotency_key: idempotencyKey,
      campaign_id: task.campaign_id,
      thread_id: threadId,
      lead_id: task.lead_id,
      provider: "gmail",
      status: "pending",
      meta: {
        source: "thread-followup-send",
        task_id: task.id,
        draft_id: draft.id ?? null,
      },
    });

    if (attemptError) {
      if ((attemptError as any).code === "23505") {
        await supabaseAdmin
          .from("followup_tasks")
          .update({ status: "skipped", reason: "duplicate_send" })
          .eq("id", payload.task_id);

        return NextResponse.json({ ok: true, status: "skipped", duplicate: true });
      }

      return NextResponse.json({ error: attemptError.message }, { status: 500 });
    }

    const sendPayload = {
      campaign_id: task.campaign_id,
      lead_id: task.lead_id,
      from_account_id: campaignRow.from_account_id,
      step_no: 1,
      subject,
      body,
      provider: "gmail",
      jitter_seconds: jitterSeconds,
      thread_id: threadId,
      nudge_no: nudgeNo,
      idempotency_key: idempotencyKey,
    } satisfies Record<string, unknown>;

    const sendResponse = await fetch(SEND_NOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sendPayload),
    });

    if (!sendResponse.ok) {
      const text = await sendResponse.text().catch(() => "");
      await supabaseAdmin
        .from("send_attempts")
        .update({ status: "error" })
        .eq("idempotency_key", idempotencyKey);
      return NextResponse.json({ error: text || `send-now failed (${sendResponse.status})` }, { status: 502 });
    }

    const { error: statusError } = await supabaseAdmin
      .from("followup_tasks")
      .update({ status: "done", reason: "manual_send" })
      .eq("id", payload.task_id);

    if (statusError) {
      return NextResponse.json({ error: statusError.message }, { status: 400 });
    }

    await supabaseAdmin
      .from("inbox_threads")
      .update({ needs_reply: false })
      .eq("id", threadId);

    await supabaseAdmin.from("activity_events").insert({
      campaign_id: task.campaign_id,
      thread_id: threadId,
      lead_id: task.lead_id,
      kind: "followup_sent",
      note: `nudge #${task.nudge_no}`,
      meta: { auto_send: false, manual: true },
    });

    return NextResponse.json({ ok: true, status: "sent" });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}


