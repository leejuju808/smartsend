import { NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const MODEL = process.env.OPENAI_SEQUENCE_MODEL || "gpt-4o-mini";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const {
      product,
      audience,
      valueProp,
      painPoints = [],
      tone = "neutral",
      length = "short",
      keepMergeTags = true,
      includePS = false,
    } = await req.json();

    if (!product || !audience || !valueProp) {
      return NextResponse.json({ error: "product, audience, valueProp required" }, { status: 400 });
    }

    const maxWords = length === "short" ? 110 : length === "medium" ? 170 : 230;

    const system = `You create a 5-email cold outreach sequence for SMB sales.
Constraints:
- Output JSON ONLY: { steps: [{label, delay_hours, subject, body, purpose}] }
- Exactly 5 steps: Intro, Follow-up 1, Follow-up 2, Follow-up 3, Breakup.
- tone=${tone}; length cap ~${maxWords} words per body.
- Plain text, no HTML, no emojis.
- Preserve {{first_name}}, {{company}}, {{your_name}} merge tags if present in input or if needed. Do NOT invent other tag formats.
- 1 low-friction CTA each (e.g., "worth a quick 7-min chat?").
- Avoid spammy words (free!!!, urgent, guarantee, etc.).
${includePS ? "- Optional P.S. if clarifies value.\n" : ""}
- Purposes:
  * Intro: cold_outreach
  * Follow-up 1-3: follow_up
  * Breakup: breakup
Delays (defaults, can adjust slightly): [0, 48, 96, 168, 240] hours.`;

    const user = `PRODUCT: ${product}
AUDIENCE: ${audience}
VALUE PROP: ${valueProp}
PAINS: ${(painPoints || []).join("; ")}


If you include greeting, use "Hi {{first_name}},".
Keep bodies generic; do not auto-fill company-specific data.
Subjects should be concise & specific, not clickbaity.`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.5,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        response_format: { type: "json_object" }
      })
    });

    const json = await resp.json();
    if (!resp.ok) {
      return NextResponse.json({ error: json?.error?.message || "OpenAI error" }, { status: 500 });
    }

    const data = JSON.parse(json.choices?.[0]?.message?.content || "{}");
    if (!data?.steps || !Array.isArray(data.steps) || data.steps.length !== 5) {
      return NextResponse.json({ error: "Malformed AI response" }, { status: 500 });
    }

    if (keepMergeTags) {
      data.steps = data.steps.map((s: any) => ({
        ...s,
        body: String(s.body || "")
          .replace(/\{\{ ?first[-_ ]?name ?\}\}/gi, "{{first_name}}")
          .replace(/\{\{ ?company ?\}\}/gi, "{{company}}"),
      }));
    }

    return NextResponse.json({ steps: data.steps });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Sequence generation failed" }, { status: 500 });
  }
}


