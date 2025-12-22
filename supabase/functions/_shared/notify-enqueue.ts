// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_ORIGIN = Deno.env.get("APP_ORIGIN")!;

export async function enqueueHotReply(thread: any) {
  const sb = createClient(SB_URL, SRK);
  const { data: camp } = await sb
    .from("campaigns")
    .select("user_id, name")
    .eq("id", thread.campaign_id)
    .maybeSingle();

  if (!camp?.user_id) return;

  const { data: pref } = await sb
    .from("notification_prefs")
    .select("*")
    .eq("user_id", camp.user_id)
    .maybeSingle();

  if (pref && pref.on_hot_reply !== true) return;

  const url = `${APP_ORIGIN}/inbox?t=${thread.thread_id}`;
  const payload = {
    title: "🔥 Hot reply",
    body: `${thread.lead_email || "Lead"} replied: ${
      thread.last_ai_label || "reply"
    }`,
    url,
    campaign_id: thread.campaign_id,
    thread_id: thread.thread_id,
  };

  await sb.from("notifications_outbox").insert({
    kind: "hot_reply",
    user_id: camp.user_id,
    thread_id: thread.thread_id,
    payload,
  });
}

export async function enqueueOverdue(task: any) {
  const sb = createClient(SB_URL, SRK);
  const { data: owner } = await sb
    .from("campaigns")
    .select("user_id")
    .eq("id", task.campaign_id)
    .maybeSingle();

  if (!owner?.user_id) return;

  const { data: pref } = await sb
    .from("notification_prefs")
    .select("*")
    .eq("user_id", owner.user_id)
    .maybeSingle();

  if (pref && pref.on_overdue_task !== true) return;

  const url = `${APP_ORIGIN}/inbox?t=${task.thread_id}`;
  const payload = {
    title: "⏰ Task overdue",
    body: `${task.title || "Follow-up"} is overdue`,
    url,
    task_id: task.id,
    thread_id: task.thread_id,
  };

  await sb.from("notifications_outbox").insert({
    kind: "overdue_task",
    user_id: owner.user_id,
    thread_id: task.thread_id,
    task_id: task.id,
    payload,
  });
}











