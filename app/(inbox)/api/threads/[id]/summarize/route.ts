import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const SENTIMENTS = new Set(["positive", "neutral", "negative"]);

const SYSTEM = `
You are an assistant that reads an inbound email reply and returns STRICT JSON:
{
  "summary": "2-4 bullet lines, crisp, factual",
  "sentiment": "positive|neutral|negative",
  "intent": "scheduling|question|not_interested|out_of_office|replied|neutral|unclear",
  "suggested_action": {
    "type": "acknowledge|propose_times|ask_clarifying|respect_ooo|handoff|close_lost",
    "reason": "1-2 lines explaining why",
    "snooze_days": null | 1 | 3 | 7,
    "label": null | "Hot Lead" | "Needs Review" | "Closed - Lost",
    "followup_subject": "subject line for the reply",
    "followup_body": "short reply email, preserve tokens like {{first_name}} {{company}}"
  }
}
Rules:
- If they share availability or ask to schedule → type=propose_times (include a short CTA).
- If OOO → type=respect_ooo, set snooze_days (default 3) and keep reply very brief.
- If 'not interested' → type=close_lost with polite closure; label 'Closed - Lost'.
- If a technical question → type=ask_clarifying with 1-2 focused questions.
- If intent suggests scheduling, include the token {{time_options}} in followup_body where three time bullets will be injected.
- Keep followup_body <= 120 words, simple paragraphs, no links unless asked.
- Preserve variable tokens exactly if present.
`.trim();

function normalizeSummary(summary: unknown): string {
  if (Array.isArray(summary)) {
    return summary.join("\n");
  }
  if (typeof summary === "string") {
    return summary;
  }
  return "";
}

function normalizeSentiment(sentiment: unknown): "positive" | "neutral" | "negative" {
  if (typeof sentiment === "string" && SENTIMENTS.has(sentiment)) {
    return sentiment as "positive" | "neutral" | "negative";
  }
  return "neutral";
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const threadId = params.id;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: msg, error: msgError } = await supabase
    .from("messages")
    .select("id, body_text, direction")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (msgError) {
    return NextResponse.json({ ok: false, error: "Failed to load message" }, { status: 500 });
  }

  if (!msg || msg.direction !== "inbound") {
    return NextResponse.json({ ok: false, error: "No inbound message to summarize" }, { status: 400 });
  }

  const { data: detection } = await supabase
    .from("reply_detections")
    .select("evidence")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const anchorISO =
    typeof detection?.evidence === "object" && detection?.evidence !== null
      ? (detection.evidence.ooo_window_end as string | null) ??
        (detection.evidence.ooo_return_date as string | null) ??
        null
      : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("id", user.id)
    .maybeSingle();

  const accountId = profile?.account_id ?? null;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OpenAI API key missing" }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = (msg.body_text || "").slice(0, 8000);

  if (!prompt.trim()) {
    return NextResponse.json({ ok: false, error: "Message is empty" }, { status: 400 });
  }

  let completion;
  const t0 = Date.now();
  try {
    completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to summarize" }, { status: 500 });
  }
  const latency = Date.now() - t0;

  let payload: any = {};
  try {
    payload = JSON.parse(completion.choices[0]?.message?.content || "{}");
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON from model" }, { status: 500 });
  }

  const summary = normalizeSummary(payload.summary);
  const sentiment = normalizeSentiment(payload.sentiment);
  const intent = typeof payload.intent === "string" ? payload.intent : "unclear";
  const suggestedAction =
    payload && typeof payload === "object" && typeof payload.suggested_action === "object" && !Array.isArray(payload.suggested_action)
      ? payload.suggested_action
      : {};
  if (anchorISO) {
    (suggestedAction as Record<string, unknown>).anchorISO = anchorISO;
  }

  const { error: insertError } = await supabase.from("reply_summaries").insert({
    account_id: accountId,
    user_id: user.id,
    thread_id: threadId,
    message_id: msg.id,
    summary,
    sentiment,
    intent,
    suggested_action: suggestedAction,
    model: "gpt-4o-mini",
    tokens: completion.usage?.total_tokens ?? null,
    latency_ms: latency,
  });

  if (insertError) {
    return NextResponse.json({ ok: false, error: "Failed to store summary" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    summary: payload.summary ?? summary,
    sentiment,
    intent,
    suggested_action: suggestedAction,
  });
}

