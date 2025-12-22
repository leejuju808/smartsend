import { NextRequest, NextResponse } from "next/server";

type Req = {
  subject?: string;
  body: string;
  tone?: "warm"|"concise"|"formal"|"casual"|"assertive";
  length?: "short"|"medium"|"long";
  variantCount?: number;
  // optional: custom merge tags (if you use [[first_name]] etc.)
  mergeTags?: string[];
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.TEMPLATE_REWRITER_MODEL || "gpt-4o-mini";
const OPENAI_KEY = process.env.OPENAI_API_KEY!;

// Detect common merge-tag patterns: {tag}, {{tag}}, [[tag]], <%tag%>
const DEFAULT_TAG_REGEX = /(\{\{\s*[\w\.]+\s*\}\}|\{\s*[\w\.]+\s*\}|\[\[\s*[\w\.]+\s*\]\]|<%\s*[\w\.]+\s*%>)/g;

function extractTags(text: string, extra?: string[]) {
  const set = new Set<string>();
  const matches = text.match(DEFAULT_TAG_REGEX) || [];
  for (const m of matches) set.add(m.trim());
  for (const x of extra || []) set.add(x.trim());
  return Array.from(set);
}

function guardrails(tone?: Req["tone"], length?: Req["length"]) {
  const toneMap: Record<string,string> = {
    warm: "friendly, respectful, human",
    concise: "crisp, straight-to-the-point, remove fluff",
    formal: "professional, polished, courteous",
    casual: "light, approachable, modern",
    assertive: "confident, clear ask, no fluff"
  };
  const lengthMap: Record<string,string> = {
    short: "70–110 words",
    medium: "120–170 words",
    long: "180–250 words"
  };
  return {
    toneDesc: toneMap[tone || "warm"],
    lengthDesc: lengthMap[length || "medium"]
  };
}

const SYSTEM = `You are an email copy editor for cold outreach. You rewrite for clarity, persuasion, and deliverability.

Rules:
- Preserve all merge tags EXACTLY as given (do not remove, rename, or translate them).

- Keep one clear CTA. Avoid spammy words and excessive punctuation.

- Use sentence case for subject lines; no emojis.

- Break long paragraphs. Prefer 2–4 short paragraphs and 1 bulleted list if helpful.

- Avoid making up details; reuse only what's provided.

- Never output tracking placeholders.

Return STRICT JSON: { "variants": [ { "subject": "...", "body": "..." }, ... ] }`;

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const body = (await req.json()) as Req;
    const {
      subject = "",
      body: inputBody,
      tone = "warm",
      length = "medium",
      variantCount = 2,
      mergeTags = []
    } = body;

    if (!inputBody || typeof inputBody !== "string") {
      return NextResponse.json({ error: "body required" }, { status: 400 });
    }

    const clamp = Math.max(1, Math.min(3, Number(variantCount || 2)));
    const allTags = [
      ...extractTags(`${subject}\n${inputBody}`),
      ...mergeTags
    ].filter(Boolean);

    const { toneDesc, lengthDesc } = guardrails(tone, length);

    const userPrompt = JSON.stringify({
      tone: toneDesc,
      length: lengthDesc,
      subject,
      body: inputBody,
      merge_tags: allTags,
      instructions: [
        "Keep tags exactly as-is.",
        "If no subject provided, invent a succinct one aligned with the new copy.",
        "One CTA only; suggest next step (book call / reply).",
        "Neutralize spammy phrases; prefer plain language.",
        "Return exactly N variants."
      ],
      variants: clamp
    }, null, 2);

    const resp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: `LLM error: ${text}` }, { status: 500 });
    }

    const j = await resp.json();
    const content = j?.choices?.[0]?.message?.content;
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const variants = Array.isArray(parsed?.variants) ? parsed.variants : [];

    // Final safety: ensure merge tags survived exactly
    const ensureTags = (txt: string) => {
      for (const tag of allTags) {
        if (!txt.includes(tag)) {
          // If missing, append a line with missing tag softly (rare)
          txt += `\n\n${tag}`;
        }
      }
      return txt;
    };

    const clean = variants.slice(0, clamp).map((v: any) => ({
      subject: String(v?.subject || subject || "").slice(0, 120),
      body: ensureTags(String(v?.body || inputBody || ""))
    }));

    return NextResponse.json({ variants: clean });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
