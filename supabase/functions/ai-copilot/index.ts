import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

type Action =
  | "shorten"
  | "expand"
  | "clarify"
  | "friendlier"
  | "formal"
  | "bulletize"
  | "fix"
  | "custom";

type Payload = {
  action: Action;
  text: string;
  context?: string;
  campaign_id?: string;
  thread_id?: string;
  model?: string;
};

const ACTIONS: Record<Action, string> = {
  shorten: "Rewrite shorter, keep key information and CTA.",
  expand: "Expand to 20–40% longer, add 1 concrete detail and a clear CTA.",
  clarify: "Rewrite for clarity at 8th-grade reading level. Remove ambiguities.",
  friendlier: "Rewrite friendlier and warmer, still concise and professional.",
  formal: "Rewrite more formal and polished.",
  bulletize: "Convert to 3–6 concise bullet points with parallel structure.",
  fix: "Fix grammar, spelling, and flow without changing intent.",
  custom: "Improve the writing, concise and helpful.",
};

const SYSTEM = `You help rewrite small email snippets inside a composer.
Rules:
- Keep plain text (no HTML unless asked).
- Preserve meaning; remove fluff.
- Respect the requested tone/action strictly.
- Never invent facts; if unsure, keep it generic.
- Output ONLY the transformed text, no preamble.`;

function buildUserPrompt(p: Payload) {
  const base = `Selected text:
"""${p.text}"""
`;
  const ctx = p.context?.trim()
    ? `Context for guidance (do NOT copy private data):
"""${p.context.trim()}"""
`
    : "";

  const ask =
    p.action === "custom" && p.context?.trim()
      ? p.context.trim()
      : ACTIONS[p.action];

  return `${base}${ctx}
Instruction: ${ask}`.trim();
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const OPENAI_KEY = Deno.env.get("OPENAI_KEY") ?? Deno.env.get("OPENAI_API_KEY") ?? "";
const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

async function rateLimit(userId: string | null, threadId: string | null) {
  if (!userId && !threadId) return;

  const since = new Date(Date.now() - 60_000).toISOString();
  const query = supabase
    .from("ai_copilot_uses")
    .select("id", { head: true, count: "exact" })
    .gte("created_at", since);

  if (userId) {
    query.eq("user_id", userId);
  } else if (threadId) {
    query.eq("thread_id", threadId);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`rate_limit_error: ${error.message}`);
  }
  if ((count ?? 0) >= 30) {
    throw new Response("Too many ai-copilot requests", { status: 429 });
  }
}

async function logUsage(row: {
  user_id: string | null;
  thread_id: string | null;
  action: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  ok: boolean;
  error: string | null;
}) {
  await supabase.from("ai_copilot_uses").insert(row).catch(() => null);
}

Deno.serve(async (req: Request) => {
  let userId: string | null = null;
  let threadId: string | null = null;
  try {
    const payload = (await req.json()) as Payload;

    if (!payload?.text?.trim() || !payload?.action) {
      return new Response("Missing text/action", { status: 400 });
    }

    if (!ACTIONS[payload.action]) {
      return new Response("Unsupported action", { status: 400 });
    }

    userId = req.headers.get("x-user-id");
    threadId = payload.thread_id ?? null;

    try {
      await rateLimit(userId, threadId);
    } catch (rlError) {
      if (rlError instanceof Response) {
        await logUsage({
          user_id: userId,
          thread_id: threadId,
          action: "error",
          tokens_in: null,
          tokens_out: null,
          latency_ms: null,
          ok: false,
          error: "rate_limited",
        });
        return rlError;
      }
      throw rlError;
    }

    const text = payload.text.trim();
    const t0 = performance.now();
    if (!openai) {
      throw new Error("missing_openai_key");
    }

    const completion = await openai.chat.completions.create({
      model: payload.model ?? "gpt-4o-mini",
      temperature: payload.action === "formal" ? 0.1 : 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUserPrompt({ ...payload, text }) },
      ],
    });

    const out = completion.choices?.[0]?.message?.content?.trim() ?? "";
    const latency = Math.round(performance.now() - t0);
    const usage = completion.usage ?? { prompt_tokens: null, completion_tokens: null };

    const ok = out.length > 0;

    await logUsage({
      user_id: userId,
      thread_id: threadId,
      action: payload.action,
      tokens_in: usage.prompt_tokens ?? null,
      tokens_out: usage.completion_tokens ?? null,
      latency_ms: latency,
      ok,
      error: ok ? null : "empty",
    });

    return new Response(
      JSON.stringify({ ok, text: ok ? out : text, latency_ms: latency }),
      { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await logUsage({
      user_id: userId,
      thread_id: threadId,
      action: "error",
      tokens_in: null,
      tokens_out: null,
      latency_ms: null,
      ok: false,
      error: message,
    });

    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

