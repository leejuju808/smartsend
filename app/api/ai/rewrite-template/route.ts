import { NextRequest } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set. /api/ai/rewrite-template will fail.");
}

type Mode =
  | "improve"
  | "shorter"
  | "more_casual"
  | "more_formal"
  | "more_direct"
  | "variant";

export async function POST(req: NextRequest) {
  try {
    const { subject, body, mode, context } = await req.json();

    if (!body && !subject) {
      return new Response(
        JSON.stringify({ error: "subject_or_body_required" }),
        { status: 400 }
      );
    }

    const m: Mode = mode || "improve";

    const instructionsByMode: Record<Mode, string> = {
      improve:
        "Improve clarity and persuasion, keep length and core message similar. Keep it suitable for cold email.",
      shorter:
        "Rewrite to be significantly shorter and punchier while keeping the same core message and call-to-action. Remove fluff.",
      more_casual:
        "Rewrite in a more casual, friendly tone. Still professional, but less stiff and corporate. Keep it short and direct.",
      more_formal:
        "Rewrite in a more formal, polished tone suitable for executives, while keeping it concise.",
      more_direct:
        "Rewrite to be more direct and decisive. Make the ask clearer and remove hedging language.",
      variant:
        "Rewrite as an alternative A/B test variant. Keep the same offer and core idea, but change framing, angle, and wording enough that it will test differently.",
    };

    const systemPrompt = `
You are an expert B2B cold email copywriter working for a SaaS called SmartSend that automates cold outreach.
You will receive a subject line and body of an email (both optional, but at least one will be present), plus a rewrite mode.
You must return clean, ready-to-send text. DO NOT add preambles or explanations.

Rules:
- Preserve the core offer and facts.
- Keep it in English.
- Keep formatting simple (plain text, minimal bullets).
- Do NOT add placeholders that weren't in the original (like {{first_name}}) unless they were already there.
- Return JSON only in the exact shape: { "subject": string | null, "body": string }.
`;

    const userPrompt = `
Mode: ${m}
Instructions: ${instructionsByMode[m]}

Context (optional):
${context || "None"}

Original subject:
${subject || "(none)"}

Original body:
${body || "(none)"}
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
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("OpenAI error:", text);
      return new Response(JSON.stringify({ error: "openai_error", detail: text }), {
        status: 500,
      });
    }

    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content;

    let parsed: { subject?: string | null; body?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      // fallback: treat raw as body only
      parsed = { subject: subject || null, body: raw };
    }

    return new Response(
      JSON.stringify({
        subject: parsed.subject ?? subject ?? null,
        body: parsed.body || body || "",
      }),
      { status: 200 }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
    });
  }
}







