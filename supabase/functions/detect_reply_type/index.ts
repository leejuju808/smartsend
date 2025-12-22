import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertBearer, readJson } from "../_shared/middleware.ts";

type ReplyLabel = "positive" | "neutral" | "question" | "negative" | "ooo";

const VALID_LABELS: ReplyLabel[] = ["positive", "neutral", "question", "negative", "ooo"];

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function logInvocation(
  fn: string,
  payload: unknown,
  status: number,
  t0: number,
  err?: unknown
) {
  const latency = Math.round(performance.now() - t0);
  const errorText =
    err instanceof Response
      ? `${err.status} ${err.statusText ?? ""}`.trim()
      : err instanceof Error
      ? err.stack ?? err.message
      : err != null
      ? String(err)
      : null;

  const { error } = await supabase.from("fn_invocations").insert({
    fn,
    payload,
    status_code: status,
    latency_ms: latency,
    error_text: errorText,
  });

  if (error) {
    console.error("fn_invocations insert failed", error);
  }
}

function heuristicLabel(text: string): ReplyLabel | null {
  const low = text.toLowerCase();

  if (
    /(out\s+of\s+office|automatic reply|auto[-\s]?reply|vacation responder|away until|ooo|auto-response)/i.test(
      text
    )
  ) {
    return "ooo";
  }

  const negativePatterns =
    /(not interested|stop contacting|unsubscribe|do not email|no longer|please remove|cancel|angry|upset|frustrated|terrible|awful)/;
  if (negativePatterns.test(low)) {
    return "negative";
  }

  const positivePatterns =
    /(thank you|thanks|sounds good|happy to|excited|awesome|great|fantastic|looking forward|love to|perfect|wonderful|glad)/;
  if (positivePatterns.test(low)) {
    return "positive";
  }

  const questionPatterns =
    /(\bwho\b|\bwhat\b|\bwhen\b|\bwhere\b|\bwhy\b|\bhow\b|\bcan\b|\bcould\b|\bshould\b|\bwould\b).*?\?/;
  if (questionPatterns.test(low) || text.trim().endsWith("?")) {
    return "question";
  }

  return null;
}

async function classifyWithOpenAI(text: string): Promise<ReplyLabel> {
  const prompt = [
    "Classify the following email reply into exactly one of these labels:",
    "[positive, neutral, question, negative, ooo].",
    "Return only the single label in lowercase.",
    "",
    "Email reply:",
    text,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  const rawContent: string = json.choices?.[0]?.message?.content ?? "";
  const cleaned = rawContent.trim().toLowerCase().replace(/[^a-z]/g, "");

  const label = VALID_LABELS.find((candidate) => cleaned === candidate);
  return label ?? "neutral";
}

export async function handler(req: Request) {
  const t0 = performance.now();
  const env = Deno.env.toObject();

  let payload: { thread_id: string; reply_text: string } | null = null;
  let threadIdForUnlock: string | null = null;
  let lockAcquired = false;
  let status = 500;
  let response: Response | null = null;
  let errForLog: unknown;

  try {
    assertBearer(req, env);
    payload = await readJson(req, (x: unknown) => {
      if (!x || typeof x !== "object" || x === null) throw 0;
      const body = x as Record<string, unknown>;
      const threadId = body.thread_id;
      const reply = body.reply_text;
      if (typeof threadId !== "string" || threadId.length === 0) throw 0;
      if (typeof reply !== "string" || reply.trim().length === 0) throw 0;
      return { thread_id: threadId, reply_text: reply };
    });

    const threadId = payload.thread_id;
    const replyText = payload.reply_text.trim();
    threadIdForUnlock = threadId;

    const scope = `thread:${threadId}`;
    const rl = await supabase.rpc("rl_take", {
      p_scope: scope,
      p_cost: 1,
      p_refill_rate: 1,
      p_cap: 120,
    });
    if (rl.error) {
      throw rl.error;
    }
    if (rl.data === false) {
      throw new Response("Rate limited", { status: 429 });
    }

    const lock = await supabase.rpc("lock_thread", { p_thread: threadId });
    if (lock.error) {
      throw lock.error;
    }
    if (lock.data !== true) {
      throw new Response("Busy", { status: 423 });
    }

    lockAcquired = true;

    let label = heuristicLabel(replyText);
    if (!label) {
      label = await classifyWithOpenAI(replyText);
    }

    const { error } = await supabase
      .from("inbox_threads")
      .update({ reply_type: label })
      .eq("id", threadId);

    if (error) {
      throw error;
    }

    status = 200;
    response = new Response(JSON.stringify({ ok: true, label }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    errForLog = error;
    if (error instanceof Response) {
      status = error.status;
      response = error;
    } else {
      console.error("detect-reply-type error", error);
      status = 500;
      response = new Response("Internal Error", {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  } finally {
    if (lockAcquired && threadIdForUnlock) {
      const unlock = await supabase.rpc("unlock_thread", { p_thread: threadIdForUnlock });
      if (unlock.error) {
        console.error("unlock_thread failed", unlock.error);
      }
    }
    await logInvocation("detect-reply-type", payload, status, t0, errForLog);
  }

  return response ?? new Response("Internal Error", { status });
}

Deno.serve(handler);
