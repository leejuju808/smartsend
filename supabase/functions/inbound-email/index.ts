// supabase/functions/inbound-email/index.ts
// Deno deploy target. Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY (optional)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type InboundPayload = {
  campaign_id: string;         // your internal campaign
  lead_id: string;             // your internal lead
  from_email: string;          // sender
  to_email: string;            // your mailbox
  subject?: string;
  text?: string;
  html?: string;
  message_id?: string;         // provider message id
  thread_id?: string;          // provider thread id
  sent_at?: string;            // ISO
};

type Label = "ooo" | "unsubscribe" | "bounce" | "positive" | "neutral" | "negative" | "other";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function classify(text: string, subject?: string): Promise<{ai_label: Label; ai_intent?: string; ai_confidence: number; is_human: boolean}> {
  const blob = `${subject ?? ""}\n${text ?? ""}`.toLowerCase();

  // quick heuristics first (fast + free)
  const heur = (() => {
    // UNSUBSCRIBE
    if (/\bunsub\b|\bunsubscribe\b|remove me|stop emailing|opt out|take me off/i.test(blob)) {
      return { label: "unsubscribe" as Label, intent: "unsubscribe", conf: 0.95, human: true };
    }
    // OOO / Auto-replies
    if (/out of office|auto-?reply|i am away|on vacation|automatic reply|mailer-daemon/i.test(blob)) {
      return { label: "ooo" as Label, intent: "ooo", conf: 0.9, human: false };
    }
    // BOUNCE
    if (/mail delivery failed|undeliverable|address not found|550|5\.1\.1|bounce/i.test(blob)) {
      return { label: "bounce" as Label, intent: "bounce", conf: 0.95, human: false };
    }
    // Simple sentiment guess
    if (/yes|let's talk|interested|sounds good|book|schedule|call|demo|pricing/i.test(blob)) {
      return { label: "positive" as Label, intent: "book call", conf: 0.75, human: true };
    }
    if (/not interested|stop|no thanks|no thank/i.test(blob)) {
      return { label: "negative" as Label, intent: "decline", conf: 0.75, human: true };
    }
    return { label: "neutral" as Label, intent: "general reply", conf: 0.6, human: true };
  })();

  // If no OpenAI key, return heuristic
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return { ai_label: heur.label, ai_intent: heur.intent, ai_confidence: heur.conf, is_human: heur.human };
  }

  // Optional: refine with LLM (best-effort; don't block)
  try {
    const prompt = `Classify this email reply for a cold outreach thread.

Return JSON with keys: ai_label(one of ooo,unsubscribe,bounce,positive,neutral,negative,other), ai_intent(short), ai_confidence(0..1), is_human(true/false).

Text:
SUBJECT: ${subject ?? ""}

BODY:
${text ?? ""}
`;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini", // lightweight + cheap
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        response_format: { type: "json_object" }
      })
    });
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content?.trim();
    const parsed = content ? JSON.parse(content) : null;

    if (parsed?.ai_label) {
      return {
        ai_label: parsed.ai_label,
        ai_intent: parsed.ai_intent ?? heur.intent,
        ai_confidence: typeof parsed.ai_confidence === "number" ? parsed.ai_confidence : heur.conf,
        is_human: typeof parsed.is_human === "boolean" ? parsed.is_human : heur.human
      };
    }
  } catch (_e) {
    // fall through to heuristic
  }

  return { ai_label: heur.label, ai_intent: heur.intent, ai_confidence: heur.conf, is_human: heur.human };
}

async function upsertThread(campaign_id: string, lead_id: string, provider_thread_id?: string) {
  // one thread per (campaign, lead)
  const { data: existing } = await supabase
    .from("inbox_threads")
    .select("id")
    .eq("campaign_id", campaign_id)
    .eq("lead_id", lead_id)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("inbox_threads")
    .insert({
      campaign_id,
      lead_id,
      provider_thread_id
    })
    .select("id")
    .single();

  if (error) throw error;
  return created.id;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const payload = await req.json() as InboundPayload;
    const sentAt = payload.sent_at ? new Date(payload.sent_at) : new Date();

    const threadId = await upsertThread(payload.campaign_id, payload.lead_id, payload.thread_id);

    const text = payload.text ?? "";
    const subject = payload.subject ?? "";

    const { ai_label, ai_intent, ai_confidence, is_human } = await classify(text, subject);

    // Insert message
    // Note: Using sender_email/receiver_email and body to match existing schema
    const { error: insErr } = await supabase.from("inbox_messages").insert({
      thread_id: threadId,
      lead_id: payload.lead_id,
      campaign_id: payload.campaign_id,
      direction: "in",
      sender_email: payload.from_email,
      receiver_email: payload.to_email,
      subject,
      body: payload.html || text, // prefer html if available, fallback to text
      sent_at: sentAt.toISOString(),
      provider_message_id: payload.message_id ?? null,
      provider_thread_id: payload.thread_id ?? null,
      ai_label,
      ai_intent,
      ai_confidence,
      is_human
    });

    if (insErr) {
      console.error("insert error", insErr);
      return new Response(JSON.stringify({ ok: false, error: insErr.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true, ai_label, is_human }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});





