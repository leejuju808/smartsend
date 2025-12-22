import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY =
  Deno.env.get("OPENAI_KEY") ??
  Deno.env.get("OPENAI_API_KEY") ??
  Deno.env.get("OPENAI_SERVICE_KEY") ??
  "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase service credentials");
}

if (!OPENAI_KEY) {
  throw new Error("Missing OpenAI API key");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const openai = new OpenAI({ apiKey: OPENAI_KEY });

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: { thread_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const thread_id = body.thread_id;
  if (!thread_id) {
    return new Response("thread_id required", { status: 400 });
  }

  const { data: ctx, error: ctxErr } = await supabase
    .from("v_thread_context")
    .select("thread_id,campaign_id,inbound_text,tz")
    .eq("thread_id", thread_id)
    .single();

  if (ctxErr || !ctx) {
    return new Response("context not found", { status: 404 });
  }

  const prompt = `
Extract Out-of-Office details from this email.
Return strict JSON with keys:
{
  "return_date": "ISO 8601 date-time when person is back, if given, otherwise null",
  "person": "Name or mailbox owner if clearly stated, else null",
  "confidence": 0.0-1.0
}
Email:
"""${ctx.inbound_text ?? ""}"""
Guidelines:
- If only a day is given (e.g., "back Monday"), assume next occurrence in the sender's likely timezone, ~09:00.
- If a date without time is given, set time to 09:00 local.
- If a range is given ("out 11/10–11/14"), return_date = the day AFTER the end, at 09:00.
- If nothing reliable, return null and confidence <= 0.3.
`;

  let parsed: any = null;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [{ role: "user", content: prompt }]
    });

    parsed = JSON.parse(response.choices[0].message?.content ?? "{}");
  } catch (error) {
    console.error("OpenAI parse error:", error);
    parsed = { return_date: null, person: null, confidence: 0.0 };
  }

  const ret = (() => {
    if (!parsed?.return_date) return null;
    const date = new Date(parsed.return_date);
    return Number.isNaN(date.getTime()) ? null : date;
  })();

  const person = typeof parsed?.person === "string" && parsed.person.trim()
    ? parsed.person.trim()
    : null;

  const conf = typeof parsed?.confidence === "number"
    ? Math.max(0, Math.min(parsed.confidence, 1))
    : 0.0;

  const { error: insErr } = await supabase.from("ooo_extracts").insert({
    campaign_id: ctx.campaign_id,
    thread_id,
    source: "llm",
    return_at: ret ? ret.toISOString() : null,
    person,
    confidence: conf,
    raw: parsed ?? {}
  });

  if (insErr) {
    console.error("Failed to insert ooo_extract:", insErr);
  }

  if (ret && conf >= 0.6) {
    try {
      await supabase
        .from("inbox_threads")
        .update({
          ooo_return_at: ret.toISOString(),
          paused_until: ret > new Date() ? ret.toISOString() : null
        })
        .eq("id", thread_id);
    } catch (error) {
      console.error("Failed to update inbox_threads:", error);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      return_at: ret ? ret.toISOString() : null,
      person,
      confidence: conf
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
}

Deno.serve(handler);







