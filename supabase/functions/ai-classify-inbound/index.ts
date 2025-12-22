// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

async function classify(text: string) {
  // Compact schema: label, intent, confidence
  const prompt = `

You are classifying inbound cold-email replies.
Labels: positive, neutral, negative, unsubscribe, ooo, bounce, other.
Return JSON: { "label": "...", "intent": "...", "confidence": 0..1 }.

Text: """${text}"""`.trim();

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { 
      "Authorization": `Bearer ${OPENAI_API_KEY}`, 
      "content-type": "application/json" 
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0
    })
  }).then(r => r.json());

  const raw = r.choices?.[0]?.message?.content ?? "{}";
  try { 
    return JSON.parse(raw); 
  } catch { 
    return { label: "other", intent: "", confidence: 0.5 }; 
  }
}

Deno.serve(async (req) => {
  try {
    const { message_id } = await req.json();
    if (!message_id) return new Response("message_id required", { status: 400 });

    const { data: m } = await sb.from("inbox_messages")
      .select("id, body_text, body_html, thread_id")
      .eq("id", message_id)
      .maybeSingle();
    
    if (!m) return new Response("not found", { status: 404 });

    const text =
      (m.body_text ?? "") || (m.body_html ?? "").replace(/<[^>]+>/g, " ");
    const res = await classify(text.slice(0, 8000));

    await sb.from("inbox_messages").update({
      ai_label: res.label,
      ai_intent: res.intent,
      ai_confidence: res.confidence,
      classified_at: new Date().toISOString()
    }).eq("id", m.id);

    if (res.label === "ooo") {
      const endpoint = `${Deno.env.get("SUPABASE_URL")}/functions/v1/auto_pause_outofoffice`;
      try {
        await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message_id,
            reply_text: text.slice(0, 8000),
          }),
        });
      } catch (err) {
        console.error("ai-classify-inbound::auto_pause_outofoffice failed", err);
      }
    }

    // If label means "real reply" (not ooo/bounce), thread is already stopped by trigger.
    return new Response(
      JSON.stringify({ ok: true, result: res }), 
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }), 
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});








