// supabase/functions/_shared/replyIntent.ts
// AI classifier that takes reply body and returns intent label

import OpenAI from "https://esm.sh/openai@4";

const client = new OpenAI(Deno.env.get("OPENAI_API_KEY")!);

export type ReplyIntent =
  | "interested"
  | "not_interested"
  | "neutral"
  | "out_of_office"
  | "unsubscribe"
  | "bounce"
  | "other";

export async function classifyReplyIntent(body: string): Promise<ReplyIntent> {
  const prompt = `
You are SmartSend AI. Classify this email reply from a cold email campaign into ONE category:

- interested       (wants a call, wants more info, positive interest)
- not_interested   (explicitly not interested, no for now)
- neutral          (asks a generic question, not clearly yes/no)
- out_of_office    (OOO, autoresponder, vacation, etc.)
- unsubscribe      (asks to be removed, stop emailing, opt-out language)
- bounce           (delivery failed, mailbox full, address does not exist)
- other            (anything else)

Return ONLY JSON, with this shape:

{
  "intent": "interested" | "not_interested" | "neutral" | "out_of_office" | "unsubscribe" | "bounce" | "other"
}

Email reply:

"""${body}"""
`;

  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });

    const json = JSON.parse(res.choices[0].message.content || "{}");
    const intent = json.intent as ReplyIntent;

    const allowed: ReplyIntent[] = [
      "interested",
      "not_interested",
      "neutral",
      "out_of_office",
      "unsubscribe",
      "bounce",
      "other",
    ];

    if (!allowed.includes(intent)) return "other";
    return intent;
  } catch (error) {
    console.error("Error classifying reply intent:", error);
    return "other";
  }
}


































































