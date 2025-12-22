import { NextRequest } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

type Tone = "casual" | "neutral" | "formal";
type Goal = "shorten" | "expand" | "punchier" | "softer" | "improve";

export async function POST(req: NextRequest) {
  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
      { status: 500 }
    );
  }

  const body = await req.json();
  const text: string | undefined = body.text;
  const tone: Tone = body.tone || "neutral";
  const goal: Goal = body.goal || "improve";
  const numVariants: number = Math.min(Math.max(body.numVariants || 1, 1), 3);

  if (!text || typeof text !== "string") {
    return new Response(JSON.stringify({ error: "text is required" }), {
      status: 400,
    });
  }

  const toneDesc =
    tone === "casual"
      ? "casual, friendly, and conversational (but still professional)"
      : tone === "formal"
      ? "clear, confident, and professional with a more formal tone"
      : "neutral, concise, professional tone";

  const goalDesc: Record<Goal, string> = {
    shorten:
      "Make the email shorter and tighter while preserving the key ideas and CTAs.",
    expand:
      "Make the email slightly longer with more clarity and value, but avoid fluff.",
    punchier:
      "Make the email more compelling and punchy, with stronger hooks and clear CTA.",
    softer:
      "Make the email softer and less aggressive, with low-pressure language.",
    improve:
      "Improve clarity, flow, and persuasiveness without changing the length too much.",
  };

  const systemPrompt = `
You are an assistant that rewrites cold email templates for a tool called SmartSend.

CRITICAL RULES:
- The text may contain merge tags in the form {{like_this}}.
- You MUST preserve ALL merge tags exactly as they appear (including double curly braces and internal text).
- Do NOT delete, rename, or reorder merge tags.
- Do NOT invent new merge tags.
- Keep line breaks and list structure reasonably similar so the email stays readable.

STYLE INSTRUCTIONS:
- Apply this tone: ${toneDesc}
- Rewrite goal: ${goalDesc[goal]}
- Audience: busy B2B buyers who receive a lot of outreach.
- You may adjust subject line and body, but keep the overall intent and offer the same.
- Keep spammy phrases and exclamation marks to a minimum.
`;

  const userPrompt = `
Original template:

"""
${text}
"""

Please output ONLY the rewritten email template with preserved merge tags, no explanations.
`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      n: numVariants,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("OpenAI error (template rewrite):", errorText);
    return new Response(
      JSON.stringify({ error: "openai_error", detail: errorText }),
      { status: 500 }
    );
  }

  const json = await res.json();
  const variants: string[] =
    json.choices?.map((c: any) => c.message?.content?.trim() || "") || [];

  return new Response(JSON.stringify({ variants }), { status: 200 });
}

