import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type Label =
  | "positive"
  | "negative"
  | "neutral"
  | "question"
  | "unsubscribe"
  | "bounce"
  | "oof";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const respond = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const VALID_LABELS: readonly Label[] = [
  "positive",
  "negative",
  "neutral",
  "question",
  "unsubscribe",
  "bounce",
  "oof",
];

serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return respond({ ok: false, error: "Server misconfigured" }, 500);
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return respond({ ok: false, error: "invalid payload" }, 400);
  }

  const { task_id, assignee, label, notes } = payload as {
    task_id?: string;
    assignee?: string;
    label?: Label;
    notes?: string;
  };

  if (!task_id || !assignee || !label) {
    return respond({ ok: false, error: "missing fields" }, 400);
  }

  if (!VALID_LABELS.includes(label)) {
    return respond({ ok: false, error: "invalid label" }, 400);
  }

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: task, error: taskErr } = await client
    .from("ai_label_tasks")
    .select("*")
    .eq("id", task_id)
    .maybeSingle();

  if (taskErr || !task) {
    return respond(
      { ok: false, error: taskErr?.message ?? "task not found" },
      404,
    );
  }

  const { error: labelErr } = await client.from("ai_labels").insert({
    task_id,
    assignee,
    message_id: task.message_id ?? null,
    label,
    notes,
  });

  if (labelErr) {
    return respond({ ok: false, error: labelErr.message }, 500);
  }

  const { error: feedbackErr } = await client.from("ai_feedback").insert({
    message_id: task.message_id ?? null,
    label,
    confidence: 0.99,
    notes: notes ?? "label-studio",
  });

  if (feedbackErr) {
    console.error("ai_feedback insert failed", feedbackErr);
  }

  const { error: taskUpdateErr } = await client
    .from("ai_label_tasks")
    .update({ status: "labeled" })
    .eq("id", task_id);

  if (taskUpdateErr) {
    return respond({ ok: false, error: taskUpdateErr.message }, 500);
  }

  const { error: finishErr } = await client
    .from("ai_label_assignments")
    .update({ finished_at: new Date().toISOString() })
    .eq("task_id", task_id)
    .eq("assignee", assignee);

  if (finishErr) {
    console.error("assignment finish update failed", finishErr);
  }

  return respond({ ok: true });
});

















