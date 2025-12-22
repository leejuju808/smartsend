import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { text, tone, length, variables } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const variableKeys = variables ? Object.keys(variables).join(", ") : "";
    
    const prompt = `
You are SmartSend's AI Template Rewriter.
Rewrite the email EXACTLY ONCE using the instructions:

TONE: ${tone || "professional"}
LENGTH: ${length || "medium"}
VARIABLES AVAILABLE: ${variableKeys || "none"}

RULES:
- Keep deliverability high (avoid spammy phrasing)
- Maintain personalization using variables (e.g., {{first_name}}, {{company}})
- Produce a natural-sounding human email
- Do NOT add placeholders outside {{variables}}
- Output ONLY the rewritten text with no commentary.
- Preserve all existing {{variable}} placeholders exactly as they appear
- If length is "concise", make it shorter (50-80 words)
- If length is "medium", keep similar length (80-120 words)
- If length is "expanded", make it longer (120-180 words)

Original:

"""
${text}
"""
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.55,
    });

    const rewritten = completion.choices[0]?.message?.content?.trim() || text;

    return NextResponse.json({
      rewritten,
    });
  } catch (error) {
    console.error("[Rewriter] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rewrite template" },
      { status: 500 }
    );
  }
}










