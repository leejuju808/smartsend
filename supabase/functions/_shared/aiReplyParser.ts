// deno-lint-ignore-file no-explicit-any
import OpenAI from "https://esm.sh/openai@4.56.0";

const client = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")!,
});

export interface ReplyIntentResult {
  summary: string;
  intent: "replied" | "interested" | "not_interested" | "unsubscribe";
}

/**
 * Analyzes email reply text and classifies the intent using OpenAI
 * @param text - The email reply text to analyze
 * @returns Promise with summary and intent classification
 */
export async function detectReplyIntent(text: string): Promise<ReplyIntentResult> {
  const prompt = `
You are SmartSend AI. Analyze this email and classify it:

Email:
"${text}"

Return a JSON object:
{
  "summary": "... short summary ...",
  "intent": "replied | interested | not_interested | unsubscribe"
}

Rules:
- "replied": Generic reply, acknowledgment, or response
- "interested": Shows interest, asks questions, wants to learn more
- "not_interested": Explicitly declines or says not interested
- "unsubscribe": Requests to be removed from emails/list
`;

  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = res.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content) as ReplyIntentResult;
    
    // Validate intent value
    const validIntents = ["replied", "interested", "not_interested", "unsubscribe"];
    if (!validIntents.includes(parsed.intent)) {
      parsed.intent = "replied"; // Default fallback
    }

    return parsed;
  } catch (error) {
    console.error("Error in detectReplyIntent:", error);
    // Return default fallback on error
    return {
      summary: "Unable to analyze reply",
      intent: "replied",
    };
  }
}


