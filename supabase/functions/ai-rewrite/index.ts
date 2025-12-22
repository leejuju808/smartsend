// Deno Deploy Function
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SECRET = Deno.env.get("AI_SECRET")!;

type ReqBody = {
  campaignId: string;
  templateId?: string | null;
  base: { subject: string; body: string };
  options?: { tone?: string; length?: "short"|"medium"|"long"; variants?: number };
};

const SYSTEM_PROMPT = `
You are an email conversion copywriter. Rewrite cold email SUBJECT and BODY to improve reply rate.

Rules:
- Preserve all merge tags exactly as-is (e.g., {{first_name}}, {{company}}, {{title}}).
- Keep plain text (no HTML). Use 2-3 short paragraphs max and one call-to-action line.
- Avoid spammy words (free!!!, guarantee, risk-free, act now).
- Subject 4–7 words. Body target words:
  - short: <= 80
  - medium: <= 130
  - long: <= 180
- Maintain factual content; do not invent details.

Return strict JSON:
{"variants":[{"subject":"...","body":"..."}, ...]}
`;

function sizeFromLength(len?: string) {
  if (len === "short") return 80;
  if (len === "long") return 180;
  return 130;
}

async function callOpenAI(body: ReqBody) {
  const limit = sizeFromLength(body.options?.length);
  const n = Math.min(Math.max(body.options?.variants ?? 3, 1), 5);

  const userPrompt = `
Base Subject: ${body.base.subject}
Base Body:
${body.base.body}

Tone: ${body.options?.tone ?? "concise"}
Target length (words): ${limit}
Variants: ${n}
`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error: ${t}`);
  }
  const json = await resp.json();
  return JSON.parse(json.choices[0].message.content);
}

function qualityScore(subject: string, body: string) {
  const text = `${subject} ${body}`.toLowerCase();
  const spammy = ["free!!!", "guarantee", "risk-free", "act now", "winner", "earn $$$", "no obligation"];
  const spamHits = spammy.filter(w => text.includes(w)).length;

  const words = body.trim().split(/\s+/).length;
  const sentences = Math.max(1, body.split(/[.!?]\s/).length);
  const avgWords = words / sentences; // heuristics

  // Score out of 100
  let score = 100;
  score -= spamHits * 10;
  if (avgWords > 24) score -= 10;
  if (avgWords < 6) score -= 8;
  if (subject.length > 60) score -= 8;

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    spamHits,
    avgWordsPerSentence: Math.round(avgWords * 10) / 10,
    wordCount: words
  };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-ss-secret") !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const body = await req.json() as ReqBody;
    // basic auth: ensure caller can access campaign
    // (light check by tokenized subject is already elsewhere;
    // here we simply trust the backend caller; production: verify JWT if needed)

    const out = await callOpenAI(body);

    // score and return
    const variants = out.variants.map((v: any, i: number) => {
      return {
        ...v,
        score: qualityScore(v.subject, v.body),
        variant_key: String.fromCharCode(65 + i) // "A", "B", "C", ...
      };
    });

    return new Response(JSON.stringify({ variants }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

