import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini"; // cheap + good enough for labels

function prompt(text: string) {
  return [
    { role: "system", content: "You label inbound sales emails for CRM automations." },
    { role: "user", content:
`Classify this inbound email with:

- ai_label: one of [positive, neutral, negative, unsubscribe, ooo, bounce, other]

- ai_intent: short phrase like "book call", "pricing question", "not interested", "unsubscribe", "out of office", "bounce"

Return strict JSON: {"ai_label":"...","ai_intent":"...","confidence":0..1}

EMAIL:

${text}` }
  ];
}

export async function POST(_req: NextRequest, { params }: { params: { message: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 1) Load message (and thread) body/snippet
  const { data: msg, error: merr } = await supabase
    .from("inbox_messages")
    .select("id, thread_id, body, body_text, snippet")
    .eq("id", params.message)
    .single();
  if (merr) return NextResponse.json({ error: merr.message }, { status: 400 });

  const body = msg?.body || msg?.body_text || "";
  const snippet = msg?.snippet;
  const textForClassification = snippet && snippet !== body ? `${snippet}\n\n---\n${body}` : (body || snippet || "");
  
  if (!textForClassification) return NextResponse.json({ error: "no message body" }, { status: 400 });

  // 2) Call OpenAI
  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY!}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: prompt(textForClassification),
      response_format: { type: "json_object" }
    })
  });
  const j = await resp.json();
  if (!resp.ok) {
    return NextResponse.json({ error: j.error?.message || "openai failed" }, { status: 400 });
  }

  let label = "other", intent = null as string | null, conf = null as number | null;
  try {
    const parsed = JSON.parse(j.choices?.[0]?.message?.content || "{}");
    label = parsed.ai_label || "other";
    intent = parsed.ai_intent || null;
    conf = typeof parsed.confidence === "number" ? parsed.confidence : null;
  } catch {
    // keep defaults
  }

  // 3) Persist + apply rules
  const { error: uerr } = await supabase
    .from("inbox_messages")
    .update({
      ai_label: label,
      ai_intent: intent,
      ai_confidence: conf,
      classified_at: new Date().toISOString()
    })
    .eq("id", params.message);
  if (uerr) return NextResponse.json({ error: uerr.message }, { status: 400 });

  const { error: rerr } = await supabase.rpc("apply_ai_reply_rules", { p_message: params.message });
  if (rerr) return NextResponse.json({ error: rerr.message }, { status: 400 });

  return NextResponse.json({ ok: true, ai_label: label, ai_intent: intent, ai_confidence: conf });
}

