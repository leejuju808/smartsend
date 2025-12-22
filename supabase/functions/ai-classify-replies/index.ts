// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Backoff sequence (1m, 5m, 25m, 2h, 6h)
function backoffMs(attempts: number) {
  const seq = [60_000, 300_000, 1_500_000, 7_200_000, 21_600_000];
  return seq[Math.min(attempts, seq.length - 1)];
}

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

async function classify(text: string) {
  const sys =
`You are a sorter for cold-email replies. Return strict JSON.

Choose label in: positive, neutral, negative, unsubscribe, ooo, bounce, other.

Also infer a short intent like "book call", "pricing question", "not interested", "wrong contact", "unsubscribe request", "out of office", etc.

Respond ONLY with JSON keys: label, intent, confidence (0..1).`;

  const user = `Email reply:\n"""${text.slice(0, 8000)}"""`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  // sanitize
  const allowed = new Set(["positive","neutral","negative","unsubscribe","ooo","bounce","other"]);
  const label = allowed.has(parsed.label) ? parsed.label : "other";
  const intent = (parsed.intent ?? "").toString().slice(0, 80);
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.6)));
  return { label, intent, confidence };
}

Deno.serve(async () => {
  // Pull a small batch of queued jobs
  const { data: jobs, error: jobsErr } = await supabase
    .from("ai_jobs")
    .select("id, message_id, attempts")
    .eq("type", "classify_reply")
    .eq("status", "queued")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(25);

  if (jobsErr) return new Response(jobsErr.message, { status: 500 });
  if (!jobs?.length) return new Response("no work");

  let done = 0, failed = 0;

  for (const job of jobs) {
    // Lock job (best-effort)
    await supabase.from("ai_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "queued");

    // Load message
    const { data: msg, error: msgErr } = await supabase
      .from("inbox_messages")
      .select("id, body_text, body_html, body")
      .eq("id", job.message_id)
      .maybeSingle();

    if (msgErr || !msg) {
      failed++;
      await supabase.from("ai_jobs").update({
        status: "error",
        updated_at: new Date().toISOString(),
        attempts: job.attempts + 1,
        last_error: msgErr?.message ?? "message not found",
        next_attempt_at: new Date(Date.now() + backoffMs(job.attempts + 1)).toISOString()
      }).eq("id", job.id);
      continue;
    }

    const plain = (msg.body_text || "")
      || (msg.body_html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      || (msg.body ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    try {
      const { label, intent, confidence } = await classify(plain);

      // Save classification
      await supabase.from("inbox_messages").update({
        ai_label: label,
        ai_intent: intent,
        ai_confidence: confidence,
        classified_at: new Date().toISOString()
      }).eq("id", msg.id);

      // Side-effects:
      // - Unsubscribe: flip lead flag and cancel future queue
      if (label === "unsubscribe") {
        // Optional: add do_not_contact on leads
        await supabase.rpc("set_lead_unsubscribed", { p_message_id: msg.id }).catch(() => {});
      }

      // - OOO: no send right now; optionally snooze future steps (handled in next slice)
      // - Bounce: mark lead as invalid (optional RPC in next slice)

      await supabase.from("ai_jobs").update({
        status: "done",
        updated_at: new Date().toISOString(),
        last_error: null
      }).eq("id", job.id);

      done++;
    } catch (err) {
      const attempts = job.attempts + 1;
      await supabase.from("ai_jobs").update({
        status: "queued",
        updated_at: new Date().toISOString(),
        attempts,
        last_error: String(err?.message ?? err),
        next_attempt_at: new Date(Date.now() + backoffMs(attempts)).toISOString()
      }).eq("id", job.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ done, failed }), { headers: { "Content-Type": "application/json" } });
});


