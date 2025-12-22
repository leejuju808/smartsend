// API endpoint for AI voicemail script generation
// Block 467 — AI Voice Steps v1

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const bodySchema = z.object({
  goal: z.enum([
    "quick_callback",
    "book_meeting",
    "introduce_yourself",
    "followup_after_email",
    "value_reminder",
  ]),
  tone: z.enum(["friendly", "direct", "professional", "energetic"]).default("friendly"),
  lead_name: z.string().optional(),
  company: z.string().optional(),
  industry: z.string().optional(),
  value_prop: z.string().optional(),
  include_sms_fallback: z.boolean().default(true),
  include_email: z.boolean().default(false),
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
      goal,
      tone,
      lead_name,
      company,
      industry,
      value_prop,
      include_sms_fallback,
      include_email,
    } = bodySchema.parse(json);

    // Map goal to human-readable description
    const goalDescriptions: Record<string, string> = {
      quick_callback: "Request a quick callback",
      book_meeting: "Book a meeting",
      introduce_yourself: "Introduce yourself",
      followup_after_email: "Follow up after sending an email",
      value_reminder: "Remind them of the value proposition",
    };

    const systemPrompt = [
      "You are SmartSend's AI voicemail script generator.",
      "Generate concise, natural-sounding voicemail scripts that get callbacks.",
      "",
      "Rules:",
      "- Keep voicemails under 30 seconds when spoken",
      "- Use conversational, natural language",
      "- Include personalization placeholders like {{first_name}}, {{company}}",
      "- One clear CTA",
      "- No hype or spammy language",
      "- Sound human, not robotic",
      "",
      "Return ONLY valid JSON matching this schema:",
      `{
        "voicemail_script": "string (the main voicemail script)",
        "sms_fallback": "string (optional SMS message if call fails)",
        "email_followup": "string (optional email if requested)"
      }`,
    ].join("\n");

    const userPrompt = [
      `Goal: ${goalDescriptions[goal]}`,
      `Tone: ${tone}`,
      lead_name ? `Lead name: ${lead_name}` : "",
      company ? `Company: ${company}` : "",
      industry ? `Industry: ${industry}` : "",
      value_prop ? `Value proposition: ${value_prop}` : "",
      "",
      "Generate:",
      "1. A voicemail script (under 30 seconds when spoken)",
      include_sms_fallback
        ? "2. A matching SMS fallback message (short, under 160 chars)"
        : "",
      include_email ? "3. A matching email follow-up (optional)" : "",
      "",
      "Use placeholders like {{first_name}}, {{company}}, {{industry_value}} for personalization.",
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
      voicemail_script?: string;
      sms_fallback?: string;
      email_followup?: string;
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
    if (!parsed.voicemail_script) {
      return NextResponse.json(
        { error: "AI did not generate a voicemail script" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      voicemail_script: parsed.voicemail_script,
      sms_fallback: parsed.sms_fallback || null,
      email_followup: parsed.email_followup || null,
    });
  } catch (err: any) {
    console.error("Error generating voicemail script:", err);
    const msg =
      err?.issues?.[0]?.message ||
      err?.message ||
      "Failed to generate voicemail script";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}



