import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export type ReplyIntent =
  | "interested" | "scheduling" | "referral" | "neutral"
  | "not_interested" | "unsubscribe" | "ooo" | "spam" | "unknown";

const RULES = [
  { re: /(unsubscribe|remove me|opt out)/i, intent: "unsubscribe" as const },
  { re: /(out of office|automatic reply|vacation until|away until)/i, intent: "ooo" as const },
  { re: /(not interested|no thanks|stop emailing)/i, intent: "not_interested" as const },
  { re: /(book|schedule|calendar|meet|call|zoom)/i, intent: "scheduling" as const },
];

export async function classifyReplyText(text: string): Promise<{ intent: ReplyIntent; confidence: number; summary: string; raw: any; }> {
  // 1) quick rules for high-precision intents
  for (const r of RULES) if (r.re.test(text)) {
    return { intent: r.intent, confidence: 0.95, summary: `Rule matched: ${r.intent}`, raw: { rule: r.re.toString() } };
  }

  // 2) LLM fallback
  const sys = `You label email replies for cold outreach. 
Return strict JSON: {"intent": "...","confidence": 0.0,"summary": "..."}.
Allowed intents: interested, scheduling, referral, neutral, not_interested, unsubscribe, ooo, spam, unknown.`;
  const usr = `Email reply:\n"""${text.slice(0, 5000)}"""`;

  const msg = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
    response_format: { type: "json_object" as any }
  });

  try {
    const parsed = JSON.parse(msg.choices[0].message.content || "{}");
    const intent = (parsed.intent || "unknown") as ReplyIntent;
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.6)));
    const summary = String(parsed.summary ?? "No summary");
    return { intent, confidence, summary, raw: parsed };
  } catch {
    return { intent: "unknown", confidence: 0.4, summary: "Parse error", raw: msg };
  }
}