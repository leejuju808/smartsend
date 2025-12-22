import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_SNOOZE = [1, 3, 7, 14, 30];

type SuggestionPayload = {
  followup_subject?: unknown;
  followup_body?: unknown;
  snooze_days?: unknown;
  label?: unknown;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const threadId = params.id;

  let payload: SuggestionPayload = {};
  try {
    payload = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const followupSubject = typeof payload.followup_subject === "string" ? payload.followup_subject.trim() : "";
  const followupBody = typeof payload.followup_body === "string" ? payload.followup_body.trim() : "";
  const snoozeDays = payload.snooze_days === null || payload.snooze_days === undefined ? null : Number(payload.snooze_days);
  const label = typeof payload.label === "string" ? payload.label.trim() : null;

  if (!followupSubject || !followupBody) {
    return NextResponse.json({ ok: false, error: "Draft subject and body are required" }, { status: 400 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ ok: false, error: "Failed to load profile" }, { status: 500 });
  }

  const accountId = profile?.account_id ?? null;
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "No account" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: existing, error: draftLookupError } = await supabase
    .from("thread_drafts")
    .select("id")
    .eq("thread_id", threadId)
    .maybeSingle();

  if (draftLookupError) {
    return NextResponse.json({ ok: false, error: "Failed to load existing draft" }, { status: 500 });
  }

  const draftPayload = {
    thread_id: threadId,
    subject: followupSubject,
    body: followupBody,
    updated_at: now,
  };

  if (existing?.id) {
    const { error: updateError } = await supabase.from("thread_drafts").update(draftPayload).eq("id", existing.id);
    if (updateError) {
      return NextResponse.json({ ok: false, error: "Failed to update draft" }, { status: 500 });
    }
  } else {
    const { error: insertError } = await supabase.from("thread_drafts").insert(draftPayload);
    if (insertError) {
      return NextResponse.json({ ok: false, error: "Failed to create draft" }, { status: 500 });
    }
  }

  if (snoozeDays && VALID_SNOOZE.includes(snoozeDays)) {
    const { error: snoozeError } = await supabase.rpc("snooze_thread", {
      p_thread_id: threadId,
      p_days: snoozeDays,
      p_account_id: accountId,
      p_actor_id: user.id,
    });
    if (snoozeError) {
      return NextResponse.json({ ok: false, error: "Failed to snooze thread" }, { status: 500 });
    }
  }

  if (label) {
    const { error: labelError } = await supabase.rpc("bulk_add_label", {
      p_account_id: accountId,
      p_label_name: label,
      p_thread_ids: [threadId],
    });
    if (labelError) {
      return NextResponse.json({ ok: false, error: "Failed to apply label" }, { status: 500 });
    }
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    account_id: accountId,
    actor_id: user.id,
    thread_id: threadId,
    entity_type: "thread",
    entity_id: threadId,
    action: "apply_suggestion",
    meta: { label, snooze_days: snoozeDays },
  });

  if (auditError) {
    return NextResponse.json({ ok: false, error: "Failed to log action" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

