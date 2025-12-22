// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const OPENAI_KEY =
  Deno.env.get("OPENAI_KEY") ??
  Deno.env.get("OPENAI_API_KEY") ??
  Deno.env.get("OPENAI_SECRET_KEY") ??
  "";

const JSON_HEADERS = { "content-type": "application/json" };
const LABELS = new Set(["positive", "neutral", "question", "negative", "ooo"]);

async function classifyReply(text: string) {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_KEY missing");
  }

  const prompt = [
    "Classify this email as one of [positive, neutral, question, negative, ooo].",
    "Only return the single label.",
    "Email:",
    text,
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`openai classify failed: ${res.status} ${errText}`);
  }

  const payload = await res.json();
  const content =
    payload?.choices?.[0]?.message?.content?.toString().trim().toLowerCase() ??
    "";
  const label = LABELS.has(content) ? content : "neutral";
  return { label, raw: payload };
}

async function extractOoo(text: string) {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_KEY missing");
  }

  const prompt = [
    'Extract return date from OOO-style text. Respond with JSON: {"return_date": ISO8601 string or null}.',
    "Text:",
    `"""${text}"""`,
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`openai extract failed: ${res.status} ${errText}`);
  }

  const payload = await res.json();
  const rawContent = payload?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    parsed = null;
  }
  const iso = typeof parsed?.return_date === "string" ? parsed.return_date : null;
  return { iso, raw: payload };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const runId: string | null = body?.run_id ?? null;
  const batch: number = Number(body?.batch ?? 100) || 100;

  if (!runId) {
    return new Response("run_id required", { status: 400 });
  }

  const { data: pending, error: pendingError } = await supabase.rpc(
    "qa_fetch_pending",
    { p_run: runId, p_limit: batch }
  );

  if (pendingError) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: pendingError.message,
      }),
      { status: 500, headers: JSON_HEADERS }
    );
  }

  const samples = pending ?? [];

  if (!samples.length) {
    await supabase
      .from("qa_runs")
      .update({ finished_at: new Date().toISOString() })
      .eq("id", runId);

    return new Response(
      JSON.stringify({ ok: true, done: true }),
      { status: 200, headers: JSON_HEADERS }
    );
  }

  const failures: Array<{ thread_id: string; error: string }> = [];
  let processed = 0;

  for (const sample of samples) {
    const threadId = sample.thread_id as string | undefined;
    if (!threadId) continue;

    try {
      const text = (sample.inbound_text as string | null) ?? "";
      const classify = await classifyReply(text);
      const extract = await extractOoo(text);

      const { error: insertError } = await supabase
        .from("qa_predictions")
        .insert({
          run_id: runId,
          thread_id: threadId,
          predicted_label: classify.label,
          ooo_predicted: extract.iso,
          raw: { classify: classify.raw, extract: extract.raw },
        });

      if (insertError) {
        throw new Error(insertError.message);
      }

      processed += 1;
    } catch (err) {
      console.error("qa-reprocess failure", err);
      failures.push({
        thread_id: threadId ?? "unknown",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: failures.length === 0,
      processed,
      failures,
    }),
    {
      status: failures.length ? 207 : 200,
      headers: JSON_HEADERS,
    }
  );
});







