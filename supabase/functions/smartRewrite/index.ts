import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "https://deno.land/x/openai@v4/mod.ts";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

type Req = {
  subject: string;
  body: string;
  niche?: string;
  tone?: "casual" | "professional" | "friendly" | "concise" | "persuasive";
  objective?: string;
  constraints?: { max_words?: number; spam_minimize?: boolean };
  variants?: number;
};

serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    const payload = (await req.json()) as Req;

    const variants = Math.min(Math.max(payload.variants ?? 3, 1), 3);
    const sys = [
      "You rewrite cold email templates.",
      "Return STRICT JSON with keys: variants: [{name, subject, body_html, rationale, spam_risk: {score, notes}}].",
      "spam_risk.score is 0-100 (higher = riskier). Keep it under 35 by default.",
      "Use concise language. Keep any HTML clean (no external CSS)."
    ].join(" ");

    const user = {
      subject: payload.subject,
      body: payload.body,
      context: {
        niche: payload.niche ?? "SMBs",
        tone: payload.tone ?? "friendly",
        objective: payload.objective ?? "book a short call",
        constraints: payload.constraints ?? { max_words: 160, spam_minimize: true },
        variants
      }
    };

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: JSON.stringify(user) }
      ],
      response_format: { type: "json_object" }
    });

    const raw = res.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.variants)) throw new Error("bad_output");

    const safe = parsed.variants.slice(0, variants).map((v: any, i: number) => ({
      name: String(v.name || `Variant ${String.fromCharCode(65 + i)}`),
      subject: String(v.subject || "").slice(0, 200),
      body_html: String(v.body_html || ""),
      rationale: String(v.rationale || ""),
      spam_risk: {
        score: Math.max(0, Math.min(100, Number(v?.spam_risk?.score ?? 20))),
        notes: String(v?.spam_risk?.notes ?? "")
      }
    }));

    return json({ variants: safe });
  } catch (e: any) {
    return json({ error: e.message || "rewrite_error" }, 500);
  }
});

function json(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}


