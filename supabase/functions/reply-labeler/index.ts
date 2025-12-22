// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MODEL = Deno.env.get("LABELER_MODEL") || "gpt-4o-mini";
const BATCH = Number(Deno.env.get("LABELER_BATCH") || "25");

type LlmOut = {
  label: "positive"|"neutral"|"negative"|"unsubscribe"|"ooo"|"bounce"|"other";
  intent?: string;         // "book call","pricing","not interested","support", etc.
  confidence: number;      // 0..1
};

const SYSTEM = `You label email replies for cold outreach. Output strict JSON with keys: label, intent, confidence.

Allowed labels: "positive","neutral","negative","unsubscribe","ooo","bounce","other".

"ooo": auto-reply out-of-office. "bounce": mail delivery failure. "unsubscribe": requests to stop emails.

"positive": willing to engage (book, intro, send info). "negative": rejects or asks not to be contacted (but not formal unsubscribe). "neutral": questions or ambiguous.

confidence is 0..1. Keep intent short (<=4 words).`;

function fewShot(user: string) {
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}

async function callLLM(prompt: string): Promise<LlmOut | null> {
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: fewShot(prompt)
      })
    });
    if (!resp.ok) {
      console.error("openai bad resp", await resp.text());
      return null;
    }
    const j = await resp.json();
    const txt = j.choices?.[0]?.message?.content?.trim();
    if (!txt) return null;
    const parsed = JSON.parse(txt);
    // Basic validation
    const label = String(parsed.label || "other").toLowerCase();
    const intent = parsed.intent ? String(parsed.intent).slice(0, 50) : null;
    let conf = Number(parsed.confidence ?? 0.5);
    if (isNaN(conf)) conf = 0.5;
    conf = Math.min(1, Math.max(0, conf));
    const allowed = ["positive","neutral","negative","unsubscribe","ooo","bounce","other"];
    if (!allowed.includes(label)) return { label: "other", intent: intent ?? undefined, confidence: conf };
    return { label, intent: intent ?? undefined, confidence: conf } as LlmOut;
  } catch (e) {
    console.error("openai err", e);
    return null;
  }
}

function trim(s: string | null | undefined, n=800) {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

async function buildPrompt(msg: any, thread: any[], lead: any) {
  // Last ~3 items context (outbound + inbound)
  const recent = thread.slice(-3).map((m: any) => {
    const dir = m.direction?.toUpperCase?.() || "UNK";
    const body = trim(m.body_text || m.body_html || m.snippet || "");
    return `[${dir}] ${body}`;
  }).join("\n");

  const leadLine = `${lead?.first_name ?? ""} ${lead?.last_name ?? ""} <${lead?.email ?? ""}> ${lead?.company ? "(" + lead.company + ")" : ""}`.trim();
  const current = trim(msg.body_text || msg.body_html || msg.snippet || "");

  return `Lead: ${leadLine}
Thread context (latest first):
${recent}

Classify the **latest inbound reply** between <<< >>>.

<<<
${current}
>>>

Return JSON: {"label":"...","intent":"...","confidence":0..1}`;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      // allow GET for ad-hoc runs
    }

    // 1) Fetch unlabeled inbound messages (handle both 'inbound' and 'in' direction values)
    const { data: msgs, error: selErr } = await supabase
      .from("inbox_messages")
      .select("id, thread_id, lead_id, direction, body_text, body_html, snippet, created_at")
      .in("direction", ["inbound", "in"])
      .is("ai_label", null)
      .order("created_at", { ascending: true })
      .limit(BATCH);

    if (selErr) return new Response(JSON.stringify({ ok:false, error: selErr.message }), { status: 500 });

    const results: any[] = [];
    for (const m of msgs ?? []) {
      // Pull small thread context
      const { data: hist } = await supabase
        .from("inbox_messages")
        .select("id, direction, body_text, body_html, snippet, created_at")
        .eq("thread_id", m.thread_id)
        .order("created_at", { ascending: true })
        .limit(10);

      const { data: lead } = await supabase
        .from("leads")
        .select("first_name,last_name,email,company")
        .eq("id", m.lead_id).maybeSingle();

      const prompt = await buildPrompt(m, hist ?? [], lead);

      const out = await callLLM(prompt);
      if (!out) continue;

      // 2) Confidence gate: if extremely low, map to "other"
      const label = out.confidence < 0.35 ? "other" : out.label;
      const intent = out.intent ?? null;
      const conf = out.confidence;

      // 3) Update row
      const { error: updErr } = await supabase
        .from("inbox_messages")
        .update({
          ai_label: label,
          ai_intent: intent,
          ai_confidence: conf,
          classified_at: new Date().toISOString()
        })
        .eq("id", m.id);

      if (updErr) {
        console.error("update fail", updErr.message);
        continue;
      }

      results.push({ id: m.id, label, intent, confidence: conf });
    }

    return new Response(JSON.stringify({ ok: true, count: results.length, results }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});
