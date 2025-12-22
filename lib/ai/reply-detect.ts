import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export type ReplyDetectResult = {
  reply_kind:
    | "positive_meeting"
    | "positive_no_meeting"
    | "neutral_question"
    | "ooh"
    | "unsubscribe"
    | "bounce"
    | "other";
  has_meeting_intent: boolean;
  is_unsubscribe: boolean;
  is_bounce: boolean;
  label: string; // short human label, e.g. "Book demo", "Unsubscribe", etc.
  confidence: number; // 0–1
  reasoning: string;
};

export async function detectReplyIntent(rawText: string): Promise<ReplyDetectResult> {
  const prompt = `
You are the SmartSend AI Reply Brain.

Classify this B2B email reply from a prospect. Output STRICT JSON with these keys:
- reply_kind: one of
  ["positive_meeting","positive_no_meeting","neutral_question","ooh","unsubscribe","bounce","other"]
- has_meeting_intent: boolean (true if they want to book or move a meeting)
- is_unsubscribe: boolean (true if they want to stop emails)
- is_bounce: boolean (true if it's a mailer daemon / delivery failure)
- label: short 2–5 word human label, e.g. "Book demo", "Not interested", "OOTO", "Unsubscribe"
- confidence: number between 0 and 1
- reasoning: brief natural language explanation

Email reply:

"""${rawText}"""
  `.trim();

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ReplyDetectResult",
        schema: {
          type: "object",
          properties: {
            reply_kind: {
              type: "string",
              enum: [
                "positive_meeting",
                "positive_no_meeting",
                "neutral_question",
                "ooh",
                "unsubscribe",
                "bounce",
                "other",
              ],
            },
            has_meeting_intent: { type: "boolean" },
            is_unsubscribe: { type: "boolean" },
            is_bounce: { type: "boolean" },
            label: { type: "string" },
            confidence: { type: "number" },
            reasoning: { type: "string" },
          },
          required: [
            "reply_kind",
            "has_meeting_intent",
            "is_unsubscribe",
            "is_bounce",
            "label",
            "confidence",
            "reasoning",
          ],
          additionalProperties: false,
        },
      },
    },
    temperature: 0.3,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No content in OpenAI response");
  }

  // Parse the JSON response
  let parsed: ReplyDetectResult;
  try {
    parsed = JSON.parse(content) as ReplyDetectResult;
  } catch (error) {
    // Fallback if parsing fails
    parsed = {
      reply_kind: "other",
      has_meeting_intent: false,
      is_unsubscribe: false,
      is_bounce: false,
      label: "Unknown",
      confidence: 0.0,
      reasoning: "Failed to parse AI response",
    };
  }

  return parsed;
}













