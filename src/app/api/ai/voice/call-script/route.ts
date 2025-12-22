// API endpoint for AI call script generation
// Block 467 — AI Voice Steps v1

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const bodySchema = z.object({
  industry: z.string().optional(),
  icp: z.string().optional(), // Ideal Customer Profile description
  value_prop: z.string().optional(),
  product_service: z.string().optional(),
  cta: z.string().default("Book a quick call"),
  include_objection_handling: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured." },
        { status: 501 }
      );
    }

    const json = await req.json();
    const {
      industry,
      icp,
      value_prop,
      product_service,
      cta,
      include_objection_handling,
    } = bodySchema.parse(json);

    const systemPrompt = [
      "You are SmartSend's AI call script generator.",
      "Generate structured call scripts for outbound sales calls.",
      "",
      "Rules:",
      "- Keep scripts concise and natural",
      "- Use personalization placeholders like {{first_name}}, {{company}}",
      "- Include intro, value prop, qualifying questions, CTA",
      "- Add objection handling if requested",
      "- Sound conversational, not scripted",
      "",
      "Return ONLY valid JSON matching this schema:",
      `{
        "intro": "string (opening line)",
        "value_prop": "string (value proposition)",
        "questions": ["string"] (array of qualifying questions),
        "cta": "string (call to action)",
        "objection_handling": {
          "not_interested": "string",
          "too_busy": "string",
          "not_right_time": "string",
          "already_have_solution": "string"
        },
        "closing": "string (call closing)"
      }`,
    ].join("\n");

    const userPrompt = [
      "Generate a complete call script with:",
      "",
      "1. Intro - Brief, natural opening",
      "2. Value Prop - What value you provide",
      "3. Questions - 2-3 qualifying questions",
      "4. CTA - Clear call to action",
      include_objection_handling ? "5. Objection Handling - Responses to common objections" : "",
      "6. Closing - How to end the call",
      "",
      industry ? `Industry: ${industry}` : "",
      icp ? `Ideal Customer Profile: ${icp}` : "",
      value_prop ? `Value Proposition: ${value_prop}` : "",
      product_service ? `Product/Service: ${product_service}` : "",
      `CTA: ${cta}`,
      "",
      "Use placeholders like {{first_name}}, {{company}}, {{project_type}} for personalization.",
      "Make it sound natural and conversational.",
    ]
      .filter(Boolean)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: {
      intro?: string;
      value_prop?: string;
      questions?: string[];
      cta?: string;
      objection_handling?: Record<string, string>;
      closing?: string;
    } = {};

    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    // Validate response
    if (!parsed.intro || !parsed.value_prop || !parsed.cta) {
      return NextResponse.json(
        { error: "AI did not generate a complete call script" },
        { status: 500 }
      );
    }

    // Format full script
    const fullScript = [
      "1. Intro:",
      parsed.intro,
      "",
      "2. Value Prop:",
      parsed.value_prop,
      "",
      "3. Qualifying Questions:",
      ...(parsed.questions || []).map((q, i) => `${i + 1}. ${q}`),
      "",
      "4. CTA:",
      parsed.cta,
      "",
      include_objection_handling && parsed.objection_handling
        ? [
            "5. Objection Handling:",
            ...Object.entries(parsed.objection_handling).map(
              ([key, value]) => `• "${key}" → ${value}`
            ),
            "",
          ]
        : [],
      parsed.closing ? ["6. Closing:", parsed.closing] : [],
    ]
      .flat()
      .join("\n");

    return NextResponse.json({
      ok: true,
      intro: parsed.intro,
      value_prop: parsed.value_prop,
      questions: parsed.questions || [],
      cta: parsed.cta,
      objection_handling: parsed.objection_handling || {},
      closing: parsed.closing || "",
      full_script: fullScript,
    });
  } catch (err: any) {
    console.error("Error generating call script:", err);
    const msg =
      err?.issues?.[0]?.message ||
      err?.message ||
      "Failed to generate call script";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}



