import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Label = "positive" | "negative" | "neutral" | "question" | "unsubscribe" | "bounce" | "oof";
type TrainingRow = {
  text: string;
  label: Label;
  messageId: string;
  feedbackId?: string;
};

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { base_model = "gpt-4o-mini", min_conf = 0.7, size = 3000, notes } = await req.json().catch(
    () => ({}),
  );

  // 1) Build a fresh training set header
  const { data: set, error: setErr } = await supabase
    .from("ai_eval_sets")
    .insert({ name: `train-${new Date().toISOString().slice(0, 10)}-${size}`, sample_size: size, source: "feedback", notes })
    .select("*")
    .single();
  if (setErr) return json({ ok: false, error: setErr.message }, 500);

  // 2) Pull high-confidence feedback by label (balanced)
  const labels: Label[] = ["positive", "negative", "neutral", "question", "unsubscribe", "bounce", "oof"];
  const per = Math.max(1, Math.floor(size / labels.length));

  // Gather rows
  const rows: TrainingRow[] = [];
  for (const label of labels) {
    const { data, error } = await supabase.from("ai_feedback")
      .select("id, message_id, label, confidence, notes")
      .eq("label", label)
      .gte("confidence", min_conf)
      .order("created_at", { ascending: false })
      .limit(per);
    if (error) return json({ ok: false, error: error.message }, 500);

    const ids = (data ?? []).map((d) => d.message_id);
    if (!ids.length) continue;
    const { data: msgs, error: mErr } = await supabase.from("messages")
      .select("id, body_text, body_html")
      .in("id", ids);
    if (mErr) return json({ ok: false, error: mErr.message }, 500);

    const map = new Map(msgs?.map((m) => [m.id, (m.body_text || m.body_html || "").slice(0, 4000)]) ?? []);
    for (const d of data ?? []) {
      const t = (map.get(d.message_id) ?? "").replace(/\r/g, " ").replace(/\n{3,}/g, "\n\n");
      if (t.trim().length < 10) continue;
      rows.push({ text: t, label: d.label as Label, messageId: d.message_id, feedbackId: d.id });
    }
  }

  // 3) Create a .jsonl in memory
  const jsonl = rows.map((r) => JSON.stringify({ prompt: r.text, completion: r.label })).join("\n");
  const path = `trainsets/${set.id}.jsonl`;
  const { error: upErr } = await supabase.storage.from("ai-datasets")
    .upload(path, new Blob([jsonl], { type: "application/json" }), { upsert: true });
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  // 4) Create training job row
  const { data: job, error: jErr } = await supabase.from("ai_training_jobs")
    .insert({ base_model, train_set_id: set.id, train_size: rows.length, status: "preparing", notes })
    .select("*")
    .single();
  if (jErr) return json({ ok: false, error: jErr.message }, 500);

  if (rows.length) {
    const captureRes = await fetch(`${supabaseUrl}/functions/v1/ai-train-capture-examples`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        training_job_id: job.id,
        rows: rows.map((r) => ({
          message_id: r.messageId,
          label: r.label,
          source: "feedback",
          ref_id: r.feedbackId ?? null,
          text_excerpt: r.text,
        })),
      }),
    });

    const captureJson = await captureRes.json().catch(() => null);
    if (!captureRes.ok || (captureJson && captureJson.ok === false)) {
      const err = captureJson?.error ?? `ai-train-capture-examples failed (${captureRes.status})`;
      return json({ ok: false, error: err }, 500);
    }
  }

  // 5) Call provider (placeholder for OpenAI fine-tune)
  const provider_job_id = `openai_${crypto.randomUUID()}`;
  await supabase.from("ai_training_jobs").update({
    status: "submitted",
    started_at: new Date().toISOString(),
    provider_job_id,
  }).eq("id", job.id);

  return json({ ok: true, training_job_id: job.id, provider_job_id, set_id: set.id, uploaded: rows.length });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

