import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
const MAX_ATTEMPTS = 5;

type PendingRow = {
  queue_id: string;
  message_id: string;
  thread_id: string | null;
  text: string | null;
  html: string | null;
  from_email: string | null;
  to_email: string | null;
  ai_label: string | null;
};

type LLMOut = { label: string; confidence: number; reason: string };

const SYS_PROMPT = `You are a concise email triage labeler for cold email replies.
Return a single JSON object with keys: label, confidence, reason.
Labels (choose one): positive, question, negative, unsubscribe, ooo, bounce, neutral.
- "positive": interested, wants call/demo/pricing.
- "question": asks for info/clarification without clear interest.
- "negative": not interested (e.g., "no thanks", "stop").
- "unsubscribe": explicit unsubscribe request or "remove me".
- "ooo": out-of-office auto-replies.
- "bounce": mail delivery failure/undeliverable.
- "neutral": anything else human that doesn’t fit above.
confidence in [0,1]. reason <= 20 words.`;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

function buildUserEmail(email: { from?: string | null; to?: string | null; subject?: string | null; body?: string | null }) {
  return `FROM: ${email.from ?? ""}\nTO: ${email.to ?? ""}\nSUBJECT: ${email.subject ?? ""}\nBODY:\n${email.body ?? ""}`;
}

function clampLabel(raw: string | null | undefined): string {
  const allowed = new Set(["positive", "question", "negative", "unsubscribe", "ooo", "bounce", "neutral"]);
  const normalized = (raw ?? "").toLowerCase().trim();
  return allowed.has(normalized) ? normalized : "neutral";
}

function clampConfidence(val: unknown, fallback = 0.5): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return num;
}

function sanitizeReason(reason: unknown): string {
  return String(reason ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

async function callLLM(row: PendingRow) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const textBody = row.text ?? "";
  const htmlBody = row.html ?? "";
  const body = textBody || htmlBody;
  const userPrompt = buildUserEmail({
    from: row.from_email,
    to: row.to_email,
    subject: "",
    body,
  });

  const payload = {
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system", content: SYS_PROMPT },
      { role: "user", content: userPrompt },
    ],
  };

  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`LLM ${resp.status} ${detail}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "{}";

  let parsed: LLMOut = { label: "neutral", confidence: 0.5, reason: "" };
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { label: "neutral", confidence: 0.5, reason: "parse failure" };
  }

  const label = clampLabel(parsed.label);
  const confidence = clampConfidence(parsed.confidence);
  const reason = sanitizeReason(parsed.reason) || "model response";

  return { label, confidence, reason };
}

async function fetchPending() {
  const supabase = svc();
  const { data, error } = await supabase.from("v_ai_pending").select("*").limit(1);
  if (error) throw error;
  const row = (data?.[0] ?? null) as PendingRow | null;
  return { row, supabase };
}

async function onSuccess(supabase: ReturnType<typeof svc>, row: PendingRow, result: { label: string; confidence: number; reason: string }) {
  await supabase
    .from("inbox_messages")
    .update({
      ai_label: result.label,
      ai_confidence: result.confidence,
      ai_reason: result.reason,
      classified_at: new Date().toISOString(),
    })
    .eq("id", row.message_id);

  if (!["bounce", "unsubscribe", "ooo", "empty"].includes(result.label)) {
    const { data: thread } = await supabase
      .from("inbox_messages")
      .select("thread_id")
      .eq("id", row.message_id)
      .maybeSingle();

    const threadId = thread?.thread_id ?? row.thread_id;
    if (threadId) {
      await supabase.rpc("cancel_future_queue_for_thread", { p_thread: threadId }).catch(() => {
        /* best-effort */
      });

      const nowIso = new Date().toISOString();
      await supabase
        .from("inbox_threads")
        .update({ replied_at: nowIso, stopped_by_reply: true, updated_at: nowIso })
        .eq("id", threadId)
        .catch(() => {
          /* best-effort */
        });
    }
  }

  await supabase.from("ai_classify_queue").update({ status: "done", last_error: null }).eq("id", row.queue_id);
}

async function onError(supabase: ReturnType<typeof svc>, row: PendingRow, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const { data: q } = await supabase
    .from("ai_classify_queue")
    .select("attempts")
    .eq("id", row.queue_id)
    .maybeSingle();

  const attempts = (q?.attempts ?? 0) + 1;
  const status = attempts >= MAX_ATTEMPTS ? "dead" : "pending";

  await supabase
    .from("ai_classify_queue")
    .update({ attempts, last_error: message, status })
    .eq("id", row.queue_id);

  if (attempts >= MAX_ATTEMPTS) {
    await supabase
      .from("inbox_messages")
      .update({ ai_label: "neutral", ai_confidence: 0.3, ai_reason: "classifier failed" })
      .eq("id", row.message_id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { row, supabase } = await fetchPending();

  if (!row) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  await supabase.from("ai_classify_queue").update({ status: "processing" }).eq("id", row.queue_id);

  try {
    const result = await callLLM(row);
    await onSuccess(supabase, row, result);

    return new Response(
      JSON.stringify({ ok: true, message_id: row.message_id, label: result.label, confidence: result.confidence }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    await onError(supabase, row, err);

    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

