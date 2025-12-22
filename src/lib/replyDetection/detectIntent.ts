export type Intent =
  | "interested"
  | "booked"
  | "not_interested"
  | "unsubscribe"
  | "ooo"
  | "ambiguous";

export type Detection = { intent: Intent; confidence: number; excerpt?: string };

const KW = {
  interested: [
    "let's talk",
    "let us talk",
    "sounds good",
    "interested",
    "schedule",
    "set up a call",
    "book a call",
    "meeting",
    "let's connect",
    "send the details",
    "demo",
    "take a look",
  ],
  booked: [
    "booked",
    "scheduled",
    "see you then",
    "calendar invite",
    "added to my calendar",
    "confirmed",
  ],
  not_interested: [
    "not interested",
    "no thanks",
    "no thank you",
    "pass for now",
    "not a fit",
    "not a good fit",
  ],
  unsubscribe: [
    "unsubscribe",
    "remove me",
    "take me off",
    "stop emailing",
    "do not contact",
    "opt out",
  ],
  ooo: [
    "out of office",
    "ooo",
    "automatic reply",
    "auto-reply",
    "on vacation",
    "away from the office",
  ],
};

function includesAny(hay: string, needles: string[]) {
  return needles.some((n) => hay.includes(n));
}

export async function detectIntentHeuristic(text: string): Promise<Detection> {
  const t = (text || "").toLowerCase();

  if (includesAny(t, KW.unsubscribe)) return { intent: "unsubscribe", confidence: 0.98 };
  if (includesAny(t, KW.ooo)) return { intent: "ooo", confidence: 0.95 };
  if (includesAny(t, KW.booked)) return { intent: "booked", confidence: 0.9 };
  if (includesAny(t, KW.interested)) return { intent: "interested", confidence: 0.85 };
  if (includesAny(t, KW.not_interested)) return { intent: "not_interested", confidence: 0.9 };

  return { intent: "ambiguous", confidence: 0.5 };
}

/** Optional: augment with OpenAI for edge cases. Set OPENAI_API_KEY to enable. */
export async function detectIntent(text: string): Promise<Detection> {
  const base = await detectIntentHeuristic(text);
  const key = process.env.OPENAI_API_KEY;
  if (!key || base.confidence >= 0.9) return base;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Classify email replies for cold outreach." },
          {
            role: "user",
            content: `Text: """${text}"""
Return JSON with fields: intent in ["interested","booked","not_interested","unsubscribe","ooo","ambiguous"], confidence (0-1), and excerpt.`,
          },
        ],
        temperature: 0.1,
      }),
    });
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content);
    // Merge with heuristic (take strongest signal)
    const intents: Intent[] = ["unsubscribe", "ooo", "booked", "interested", "not_interested", "ambiguous"];
    const pick = intents.includes(parsed.intent) ? (parsed.intent as Intent) : base.intent;
    const conf = typeof parsed.confidence === "number" ? Math.max(base.confidence, parsed.confidence) : base.confidence;
    return { intent: pick, confidence: conf, excerpt: parsed.excerpt?.slice(0, 280) };
  } catch {
    return base;
  }
} 