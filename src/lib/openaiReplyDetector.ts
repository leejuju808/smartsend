// /lib/openaiReplyDetector.ts
// AI-powered reply classification for email responses

import OpenAI from "openai";
import { ReplyDetectionResult, ReplyType } from "@/types/replyTypes";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function detectReplyType(
  subject: string,
  body: string
): Promise<ReplyDetectionResult> {
  const prompt = `
Classify this email response:

Subject: ${subject}

Body: ${body}

Categories:
1. Human Reply
2. Out of Office
3. Bounce / Delivery Failure
4. Automated System Message

Return JSON with keys: type, isHuman (boolean), confidence (0-1)
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const text = completion.choices[0].message?.content ?? "{}";

  try {
    const result = JSON.parse(text);
    
    // Normalize the result to ensure proper typing
    const normalizedResult: ReplyDetectionResult = {
      type: result.type as ReplyType,
      isHuman: Boolean(result.isHuman),
      confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0.5)),
    };

    return normalizedResult;
  } catch (error) {
    // Fallback on parse error
    console.error("Error parsing OpenAI response:", error);
    return {
      type: "Human Reply",
      isHuman: true,
      confidence: 0.5,
    };
  }
}

