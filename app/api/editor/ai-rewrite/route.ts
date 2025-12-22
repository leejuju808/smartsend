import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { autoApplyLegalFilters, getStateFromContact } from "@/src/lib/laws/state-law-helpers";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type RewriteMode =
  | "professional"
  | "shorter"
  | "friendly"
  | "aggressive"
  | "personalized"
  | "deliverability";

const instructionsByMode: Record<RewriteMode, string> = {
  professional:
    "Rewrite this text to be more professional and polished, suitable for business communication. Maintain clarity and professionalism.",
  shorter:
    "Rewrite this text to be significantly shorter while preserving the core message and key information. Remove unnecessary words and fluff.",
  friendly:
    "Rewrite this text to be more friendly and conversational while remaining professional. Make it warmer and more approachable.",
  aggressive:
    "Rewrite this text to be more direct and assertive. Make the call-to-action should be clear and compelling.",
  personalized:
    "Rewrite this text to add more personalization and make it feel more tailored to the recipient. Use available variables naturally.",
  deliverability:
    "Rewrite this text to improve email deliverability by avoiding spam triggers, reducing promotional language, and making it sound more natural and human.",
};

export async function POST(req: NextRequest) {
  try {
    const { text, mode, state_code, contact_id, lead_id } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const rewriteMode: RewriteMode = mode || "professional";
    const instructions = instructionsByMode[rewriteMode] || instructionsByMode.professional;

    const systemPrompt = `
You are an expert email copywriter working for SmartSend, an outreach platform for contractors (especially roofers).
Your task is to rewrite email text according to specific instructions while preserving all template variables.

CRITICAL RULES:
- Preserve ALL template variables exactly as they appear (e.g., {first_name}, {city}, {roof_type_guess})
- Do NOT add new variables that weren't in the original
- Do NOT remove existing variables
- Return ONLY the rewritten text with no explanations or commentary
- Keep the same general structure and formatting
- Maintain HTML formatting if present
`;

    const userPrompt = `
Mode: ${rewriteMode}
Instructions: ${instructions}

Original text:
"""
${text}
"""

Rewrite the text according to the instructions above. Preserve all variables like {first_name}, {city}, etc. exactly as they appear.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    let rewritten = completion.choices[0]?.message?.content?.trim() || text;

    // Apply legal filters based on state
    try {
      const legalFiltered = await autoApplyLegalFilters(
        { body: rewritten },
        state_code,
        contact_id,
        lead_id
      );
      rewritten = legalFiltered.body || rewritten;
    } catch (legalError) {
      // If legal filtering fails, continue with rewritten text
      console.error("[AI Rewrite] Legal filtering error (non-fatal):", legalError);
    }

    return NextResponse.json({
      rewritten,
    });
  } catch (error: any) {
    console.error("[AI Rewrite] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to rewrite text",
      },
      { status: 500 }
    );
  }
}

