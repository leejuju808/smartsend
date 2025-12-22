// app/api/ai/generate-sequence/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const bodySchema = z.object({
  product: z.string().min(10, "Give me at least one sentence about the product."),
  target: z.string().min(3, "Who are we emailing? (role/industry)"),
  tone: z.enum(["casual", "professional", "bold"]).default("professional"),
  cta: z.string().default("Book a 15-min call"),
  steps: z.number().min(3).max(5).default(3), // subject + (steps-1) follow-ups
  company: z.string().optional(),
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured." },
        { status: 501 }
      );
    }

    const json = await req.json();
    const { product, target, tone, cta, steps, company } = bodySchema.parse(json);

    const system = [
      "You are SmartSend's cold email generator.",
      "Output tight copy that avoids hype and fluff.",
      "Constraints:",
      "- Keep subject lines under 55 chars.",
      "- Keep body to ~120–170 words.",
      "- Use short paragraphs and 1-2 bullet lines max.",
      "- One clear CTA line.",
      "- Avoid spammy words ('guarantee', 'free!!!', ALL CAPS).",
      "- Personalize to the target where possible.",
      "Return ONLY valid JSON matching the schema.",
      "Schema:",
      `{
        "subject": "string",
        "messages": [
          { "label": "initial" | "followup-1" | "followup-2" | "followup-3",
            "dayOffset": number,
            "body": "string"
          }
        ]
      }`,
    ].join("\n");

    const user = [
      `Company: ${company ?? "SmartSend user"}`,
      `Product (what it does): ${product}`,
      `Target audience: ${target}`,
      `Tone: ${tone}`,
      `CTA: ${cta}`,
      `Total emails (including initial): ${steps}`,
      "Follow-up rules:",
      "- followup-1 at dayOffset 2",
      "- followup-2 at dayOffset 5",
      "- followup-3 at dayOffset 9 (only if steps >= 4)",
      "If steps < 4, omit later followups accordingly.",
      "Return strict JSON, no backticks.",
    ].join("\n");

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    // Lightweight runtime validation
    const outSchema = z.object({
      subject: z.string().min(3),
      messages: z.array(
        z.object({
          label: z.enum(["initial", "followup-1", "followup-2", "followup-3"]),
          dayOffset: z.number().int().min(0).max(30),
          body: z.string().min(30),
        })
      ).min(1),
    });

    const data = outSchema.parse(parsed);
    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err: any) {
    const msg =
      err?.issues?.[0]?.message ||
      err?.message ||
      "Failed to generate sequence";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}