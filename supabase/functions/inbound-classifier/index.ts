// Edge function inbound-classifier (service role) that:
// Upserts inbox_messages.ai_label/ai_intent/ai_confidence.
// If ai_label in reply-* categories that represent real replies, mark replied_at and cancel follow-ups.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

type Label =
  | "reply-positive"
  | "reply-neutral"
  | "reply-negative"
  | "reply-oos"
  | "reply-ooo"
  | "noise";

async function classifyMessage(text: string, subject?: string): Promise<{
  ai_label: Label;
  ai_intent?: string;
  ai_confidence: number;
}> {
  if (!OPENAI_API_KEY) {
    // Fallback heuristics
    const lower = (text + " " + (subject || "")).toLowerCase();
    if (/unsub|remove|opt.*out/i.test(lower)) {
      return { ai_label: "reply-negative", ai_confidence: 0.8 };
    }
    if (/ooo|out of office|vacation|away/i.test(lower)) {
      return { ai_label: "reply-ooo", ai_confidence: 0.8 };
    }
    if (/wrong person|not the right person|vendor|referr?al/i.test(lower)) {
      return { ai_label: "reply-oos", ai_confidence: 0.7 };
    }
    if (/bounce|undeliver|failed/i.test(lower)) {
      return { ai_label: "noise", ai_confidence: 0.9 };
    }
    if (/thanks|thank you|interested|yes|meeting/i.test(lower)) {
      return { ai_label: "reply-positive", ai_confidence: 0.7 };
    }
    return { ai_label: "reply-neutral", ai_confidence: 0.5 };
  }

  try {
    const prompt = `Classify this email reply into one of these categories: reply-positive, reply-neutral, reply-negative, reply-oos, reply-ooo, noise.

Subject: ${subject || "(none)"}
Body: ${text.slice(0, 2000)}

Return JSON: {"label":"reply-...","intent":"...","confidence":0..1}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 200
      })
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    const labelMap: Record<string, Label> = {
      "reply-positive": "reply-positive",
      "positive": "reply-positive",
      "reply-neutral": "reply-neutral",
      "neutral": "reply-neutral",
      "reply-negative": "reply-negative",
      "negative": "reply-negative",
      "unsubscribe": "reply-negative",
      "reply-oos": "reply-oos",
      "oos": "reply-oos",
      "reply-ooo": "reply-ooo",
      "ooo": "reply-ooo",
      "noise": "noise",
      "bounce": "noise",
      "other": "noise",
    };

    const normalized = String(parsed.label || "").toLowerCase();
    const ai_label = labelMap[normalized] ?? "reply-neutral";
    
    return {
      ai_label,
      ai_intent: parsed.intent || null,
      ai_confidence: parsed.confidence || 0.5
    };
  } catch (e) {
    console.error("LLM classification error:", e);
    return { ai_label: "reply-neutral", ai_confidence: 0.5 };
  }
}

Deno.serve(async (req) => {
  try {
    const { message_id } = await req.json();
    if (!message_id) {
      return new Response(JSON.stringify({ ok: false, error: "message_id required" }), { status: 400 });
    }

    // Fetch message
    const { data: msg, error: msgErr } = await sb
      .from("inbox_messages")
      .select("id, thread_id, body_html, body_text, subject, lead_id, campaign_id")
      .eq("id", message_id)
      .maybeSingle();

    if (msgErr || !msg) {
      return new Response(JSON.stringify({ ok: false, error: "Message not found" }), { status: 404 });
    }

    // Extract text
    const text = (msg.body_text || "") || (msg.body_html || "").replace(/<[^>]+>/g, " ").slice(0, 2000);
    const subject = msg.subject || "";

    // Classify
    const classification = await classifyMessage(text, subject);
    const { ai_label, ai_intent, ai_confidence } = classification;

    // Update message
    await sb.from("inbox_messages").update({
      ai_label,
      ai_intent,
      ai_confidence,
      classified_at: new Date().toISOString()
    }).eq("id", message_id);

    // Log timeline event for email reply (if it's a real reply)
    if (msg.lead_id && ai_label && ['reply-positive', 'reply-neutral', 'reply-negative', 'reply-oos'].includes(ai_label)) {
      await sb.from("lead_timeline_events").insert({
        lead_id: msg.lead_id,
        event_type: "email_reply",
        metadata: {
          thread_id: msg.thread_id || null,
          message_id: message_id,
          intent: ai_intent || ai_label
        }
      }).catch((err) => {
        console.error("Failed to log timeline event:", err);
      });
    }

    // If bounce detected, link to send_log
    if (ai_label === 'noise') {
      await sb.rpc("link_bounce_to_sendlog", { p_message: message_id }).catch((err) => {
        console.error("Error linking bounce to send_log:", err);
      });
    }

    // If label indicates a reply (even if auto-generated), mark thread as replied and stop follow-ups
    if (ai_label && ['reply-positive', 'reply-neutral', 'reply-negative', 'reply-oos', 'reply-ooo'].includes(ai_label)) {
      if (msg.thread_id) {
        // Update thread
        await sb.from("inbox_threads").update({
          replied_at: new Date().toISOString(),
          stopped_by_reply: true,
          updated_at: new Date().toISOString()
        }).eq("id", msg.thread_id);

        // Cancel future queue
        await sb.rpc("cancel_future_queue_for_thread", { p_thread: msg.thread_id }).catch(() => {});
      }
    }

    return new Response(JSON.stringify({ ok: true, classification }), {
      headers: { "content-type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});
