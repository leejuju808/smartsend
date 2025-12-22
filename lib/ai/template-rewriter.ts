// lib/ai/template-rewriter.ts
import { openai } from "@/lib/openai";

export type RewriteStyle =
  | "shorter"
  | "longer"
  | "more_casual"
  | "more_formal"
  | "more_personalized"
  | "higher_reply_rate";

export type RewriteRequest = {
  subject: string;
  body: string;
  style: RewriteStyle;
  // Optional context for better rewrites (offer, audience, etc.)
  context?: string;
};

export type RewriteResponse = {
  subject: string;
  body: string;
};

export async function rewriteTemplate(
  payload: RewriteRequest
): Promise<RewriteResponse> {
  const { subject, body, style, context } = payload;

  const styleLabelMap: Record<RewriteStyle, string> = {
    shorter: "make it more concise while keeping the core pitch",
    longer: "expand with more detail & clarity (no fluff)",
    more_casual: "make it friendlier and more conversational",
    more_formal: "make it more professional and polished",
    more_personalized:
      "make it feel more tailored and specific without inventing fake facts",
    higher_reply_rate:
      "optimize for replies: clear CTA, simple, direct, low-friction ask",
  };

  const styleInstruction = styleLabelMap[style];

  const systemPrompt = `
You are an expert B2B cold email copywriter.
Your job is to REWRITE the given subject + body according to a requested style.

Rules:
- Keep the same core offer and facts (don't invent new specific data).
- Maintain CAN-SPAM compliance (no deceptive subject lines).
- 3–7 sentences in the body max unless explicitly asked for longer.
- Subject line should be under ~60 characters when possible.
- Keep links and placeholders (like {{first_name}}, {{company}}) intact.
- Output STRICTLY as JSON: { "subject": "...", "body": "..." }.
`;

  const userPrompt = `
Rewrite this cold email.

STYLE:
- ${styleInstruction}

CONTEXT (optional, may be empty):
${context || "(none provided)"}

ORIGINAL SUBJECT:
${subject}

ORIGINAL BODY:
${body}
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

  const newSubject =
    typeof parsed.subject === "string" && parsed.subject.trim()
      ? parsed.subject.trim()
      : subject;

  const newBody =
    typeof parsed.body === "string" && parsed.body.trim()
      ? parsed.body.trim()
      : body;

  return {
    subject: newSubject,
    body: newBody,
  };
}

































































