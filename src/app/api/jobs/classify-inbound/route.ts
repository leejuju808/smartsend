import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const BATCH = parseInt(process.env.REPLY_CLF_BATCH || "25", 10);

const LABELS = ["positive","neutral","negative","unsubscribe","ooo","bounce","other"] as const;
type Label = typeof LABELS[number];

const system = `You classify inbound email replies for a cold email app.
Return strict JSON: {"label": "...","intent":"...","confidence":0..1}.
"label" ∈ ["positive","neutral","negative","unsubscribe","ooo","bounce","other"].

- "positive": wants call/demo, interested, asks for pricing/details.
- "neutral": acknowledges but not clearly positive/negative.
- "negative": not interested, stop without saying unsubscribe words.
- "unsubscribe": any opt-out language (remove me, unsubscribe, stop emailing).
- "ooo": out-of-office/auto-reply.
- "bounce": delivery failure notifications.
- "other": anything else.

"intent": short phrase like "book call", "pricing", "not interested", "schedule next week", "ooo", "unsubscribe", "bounce".

If OOO or bounce or unsubscribe, set label exactly to those.`;

export async function POST(req: NextRequest) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  // Pull next batch needing classification
  const { data: rows, error } = await admin
    .from("inbox_messages")
    .select("id, subject, body_text, body_html")
    .in("direction", ["in", "inbound"])
    .is("classified_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) return new Response(error.message, { status: 400 });
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ done: true, count: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Build prompts
  const inputs = rows.map((r) => {
    const text = r.body_text ?? r.body_html?.replace(/<[^>]+>/g, "") ?? "";
    return `SUBJECT: ${r.subject ?? ""}\nBODY:\n${text.slice(0, 6000)}`; // truncate for safety
  });

  // Classify one-by-one (safer for small batches; can be parallel with Promise.allSettled)
  const updates: Array<{
    id: string;
    ai_label: Label;
    ai_intent: string;
    ai_confidence: number;
  }> = [];
  for (let i = 0; i < rows.length; i++) {
    const content = inputs[i];
    try {
      const resp = await openai.chat.completions.create({
        model: process.env.REPLY_CLF_MODEL || "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      });
      const txt = resp.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(txt);
      let label = String(parsed.label || "other").toLowerCase() as Label;
      if (!LABELS.includes(label)) label = "other";
      const intent = String(parsed.intent || "").slice(0, 80);
      const conf = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.7)));

      updates.push({
        id: rows[i].id,
        ai_label: label,
        ai_intent: intent,
        ai_confidence: conf,
      });
    } catch {
      updates.push({
        id: rows[i].id,
        ai_label: "other",
        ai_intent: "",
        ai_confidence: 0.5,
      });
    }
  }

  // Persist
  for (const u of updates) {
    await admin
      .from("inbox_messages")
      .update({
        ai_label: u.ai_label,
        ai_intent: u.ai_intent,
        ai_confidence: u.ai_confidence,
        classified_at: new Date().toISOString(),
      })
      .eq("id", u.id);
  }

  return new Response(JSON.stringify({ done: false, count: updates.length }), {
    headers: { "content-type": "application/json" },
  });
}

