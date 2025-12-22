import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Protect handlebars-style vars before sending to the model
function maskVars(input: string) {
  const map = new Map<string,string>();
  let idx = 0;
  const masked = input.replace(/\{\{\s*[^}]+?\s*\}\}/g, (m) => {
    const key = `[[VAR_${idx++}]]`;
    map.set(key, m);
    return key;
  });
  return { masked, map };
}

function unmaskVars(output: string, map: Map<string,string>) {
  let s = output;
  for (const [k,v] of map.entries()) s = s.replaceAll(k, v);
  return s;
}

// Basic spam-guard heuristics (client will show warnings too)
export function spamScore(s: string) {
  const bad = /(free money|act now|guarantee|winner|100% free|risk-free|$$$|!!!)/ig;
  let score = 0;
  score += (s.match(bad)?.length || 0) * 2;
  score += (s.match(/!{2,}/g)?.length || 0);
  score += (s.match(/[A-Z]{7,}/g)?.length || 0);
  return score; // 0 good, 5+ risky
}

export async function rewriteTemplate(opts: {
  subject?: string;
  body?: string;
  tone?: "neutral" | "friendly" | "professional" | "concise" | "casual";
  max_words?: number;         // soft cap
  variants?: number;          // 1–5
  context?: string;           // product/context hint
}) {
  const variants = Math.min(Math.max(opts.variants ?? 3, 1), 5);
  const tone = opts.tone ?? "professional";

  const sys = `You rewrite cold email content for deliverability and clarity.
Rules:
- Preserve placeholders EXACTLY (e.g., {{first_name}}, {{company}}, {{lead.custom.industry}}).
- Keep links and HTML intact.
- Avoid spammy words, excessive punctuation, all-caps, deceptive claims.
- Match requested tone and stay under the max word guidance if provided.
Return strict JSON: {"subject":["..."],"body":["..."]}.`;

  const parts: string[] = [];
  if (opts.subject) parts.push(`SUBJECT:\n${opts.subject}`);
  if (opts.body) parts.push(`BODY (HTML allowed):\n${opts.body}`);

  const { masked: maskedText, map } = maskVars(parts.join("\n\n"));

  const user = [
    `Tone: ${tone}`,
    opts.max_words ? `Max words (soft): ${opts.max_words}` : undefined,
    opts.context ? `Context: ${opts.context}` : undefined,
    `Variants: ${variants}`,
    `Text:\n"""${maskedText}"""`,
  ].filter(Boolean).join("\n");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.5,
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    response_format: { type: "json_object" as any }
  });

  const raw = resp.choices[0].message.content || "{}";
  const parsed = JSON.parse(raw);

  const subjArr: string[] = (parsed.subject || []).slice(0, variants).map((s: string) => unmaskVars(s, map));
  const bodyArr: string[] = (parsed.body || []).slice(0, variants).map((s: string) => unmaskVars(s, map));

  return {
    subject: subjArr.map(s => ({ text: s, spamScore: spamScore(s) })),
    body: bodyArr.map(b => ({ html: b, spamScore: spamScore(b) })),
  };
}