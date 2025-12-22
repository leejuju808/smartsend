// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

// ---- Config ----
const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";  // cheap, fast
const MAX_MESSAGES_PER_RUN = 25;
const MAX_COST_USD_PER_RUN = Number(Deno.env.get("LLM_MAX_COST_USD_PER_RUN") || "0.10"); // 10 cents/run cap
const LLM_CLASSIFY_ENABLED = Deno.env.get("LLM_CLASSIFY_ENABLED") !== "false"; // default true
// ----------------

type LlmOut = {
  label: 'positive'|'neutral'|'negative'|'unsubscribe'|'ooo'|'bounce'|'other';
  intent?: string;
  confidence: number; // 0..1
  summary?: string;   // short 1-liner
};

const sys = [
  { role: "system", content:
`You classify email replies from leads to cold outreach.
Return strict JSON matching this TypeScript type:

{ "label": "positive|neutral|negative|unsubscribe|ooo|bounce|other", "intent": string|null, "confidence": 0..1, "summary": string }

Guidance:
- "unsubscribe": explicit opt-out language ("unsubscribe", "remove me", "stop emailing").
- "ooo": out-of-office/auto-reply.
- "bounce": mailer-daemon/undeliverable DSNs (rare here).
- "positive": interest, request to talk/book a call, asks for proposal/pricing in a constructive tone.
- "negative": rejection ("not interested", "no thanks").
- "neutral": ambiguous or needs clarification.
Use concise 'summary' (<= 12 words).`
  }
];

async function popBatch(n = MAX_MESSAGES_PER_RUN) {
  // claim jobs safely
  const { data: jobs } = await sb
    .from("ai_jobs")
    .select("id, message_id")
    .eq("status", "queued")
    .eq("job_type", "reply_classify")
    .order("created_at", { ascending: true })
    .limit(n);
  if (!jobs?.length) return [];
  const ids = jobs.map(j => j.id);
  await sb.from("ai_jobs").update({ status: "running", started_at: new Date().toISOString(), model: MODEL }).in("id", ids);
  return jobs;
}

async function fetchMessages(ids: string[]) {
  if (!ids.length) return [];
  const { data } = await sb.from("inbox_messages")
    .select("id, thread_id, body_html, subject, from_email, to_email, created_at")
    .in("id", ids);
  return data ?? [];
}

async function openaiChatJSON(input: string) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const payload = {
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      ...sys,
      { role: "user", content: input }
    ]
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const j = await res.json();
  const choice = j.choices?.[0]?.message?.content || "{}";
  const usage = j.usage ?? { prompt_tokens: null, completion_tokens: null, total_tokens: null };
  const out = JSON.parse(choice) as LlmOut;
  return { out, usage };
}

function stripHtml(html: string) {
  return (html || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function estimateCostUSD(usage: {prompt_tokens?: number; completion_tokens?: number}) {
  // rough defaults for gpt-4o-mini pricing as of mid-2025 (adjust if you change model):
  // input ~$0.15/million, output ~$0.60/million
  const inTok = usage.prompt_tokens ?? 0;
  const outTok = usage.completion_tokens ?? 0;
  const cost = (inTok * 0.00000015) + (outTok * 0.00000060);
  return { inTok, outTok, cost };
}

Deno.serve(async () => {
  try {
    // Kill switch
    if (!LLM_CLASSIFY_ENABLED) {
      return new Response(JSON.stringify({ ok: true, processed: 0, reason: "disabled" }), { headers: { "content-type":"application/json" } });
    }

    // 1) Pop a batch
    const jobs = await popBatch();
    if (!jobs.length) return new Response(JSON.stringify({ ok: true, processed: 0 }), { headers: { "content-type":"application/json" } });

    // 2) Load messages
    const msgs = await fetchMessages(jobs.map(j => j.message_id));
    const msgMap = new Map(msgs.map(m => [m.id, m]));

    let spend = 0;
    let processed = 0;

    for (const job of jobs) {
      const m = msgMap.get(job.message_id);
      if (!m) {
        await sb.from("ai_jobs").update({ status: "error", error: "message not found" }).eq("id", job.id);
        continue;
      }

      // cost guard
      if (spend >= MAX_COST_USD_PER_RUN) {
        await sb.from("ai_jobs").update({ status: "queued", started_at: null }).eq("id", job.id);
        continue;
      }

      try {
        const content = [
          `Subject: ${m.subject ?? ""}`,
          `From: ${m.from_email ?? ""}  →  To: ${m.to_email ?? ""}`,
          `Received: ${m.created_at}`,
          ``,
          stripHtml(m.body_html ?? "")
        ].join("\n");

        const { out, usage } = await openaiChatJSON(content);
        const { inTok, outTok, cost } = estimateCostUSD(usage);
        spend += cost;

        // 3) Write message labels
        await sb.from("inbox_messages").update({
          ai_label: out.label,
          ai_intent: out.intent ?? null,
          ai_confidence: out.confidence ?? null,
          classified_at: new Date().toISOString(),
          ai_model: MODEL,
          ai_tokens_prompt: inTok,
          ai_tokens_completion: outTok,
          ai_cost_usd: cost
        }).eq("id", m.id);

        // 4) Update thread short summary (optional - store summary in thread metadata if needed)
        // For now, we'll just update the thread's updated_at
        if (out.summary) {
          await sb.from("inbox_threads").update({
            updated_at: new Date().toISOString()
          }).eq("id", m.thread_id);
        }

        await sb.from("ai_jobs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", job.id);
        processed++;
      } catch (e) {
        await sb.from("ai_jobs").update({ status: "error", finished_at: new Date().toISOString(), error: String(e).slice(0,500) }).eq("id", job.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, spend }), { headers: { "content-type":"application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500, headers: { "content-type":"application/json" } });
  }
});

