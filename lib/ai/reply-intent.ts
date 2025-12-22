// lib/ai/reply-intent.ts
import { openai } from "@/lib/openai";

export type ReplyIntentLabel =
  | "interested"
  | "not_interested"
  | "neutral"
  | "question"
  | "meeting_booked"
  | "ooo"
  | "referral"
  | "other";

export type ReplyIntentResult = {
  label: ReplyIntentLabel;
  confidence: number; // 0–1
  reason: string;
};

export async function classifyReplyIntent(args: {
  subject?: string | null;
  body?: string | null;
}): Promise<ReplyIntentResult> {
  const { subject, body } = args;

  const systemPrompt = `
You are an expert B2B sales assistant.
Classify the INTENT of this email reply in the context of a cold outreach.

You must respond ONLY as JSON:

{
  "label": "...",
  "confidence": 0.0-1.0,
  "reason": "short explanation"
}

Allowed labels:
- interested          (wants to talk, learn more, proceed)
- not_interested      (clearly declines, no for now)
- neutral             (acknowledgement but no clear yes/no)
- question            (asking clarifying questions, but not yet a yes/no)
- meeting_booked      (explicitly confirms a time or meeting)
- ooo                 (out-of-office or auto-response)
- referral            (referring to another person or team)
- other               (anything that doesn't fit)
`;

  const userPrompt = `
EMAIL SUBJECT:
${subject || "(none)"}

EMAIL BODY:
${body || "(none)"}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt.trim() },
      { role: "user", content: userPrompt.trim() },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const label: ReplyIntentLabel =
    parsed.label && typeof parsed.label === "string"
      ? (parsed.label as ReplyIntentLabel)
      : "other";

  const confidence =
    typeof parsed.confidence === "number" &&
    parsed.confidence >= 0 &&
    parsed.confidence <= 1
      ? parsed.confidence
      : 0.5;

  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : "No reason provided.";

  return { label, confidence, reason };
}

































































