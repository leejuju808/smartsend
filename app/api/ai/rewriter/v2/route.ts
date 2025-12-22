import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { text, lead, user, tone, length, mode } = await req.json();

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

    const personalization = `
Lead:
- Name: ${lead?.first_name || ""}
- Company: ${lead?.company || ""}
- Industry: ${lead?.industry || ""}
- Email: ${lead?.email || ""}

User:
- Name: ${user?.full_name || user?.email || ""}
- Company: ${user?.company || ""}
`;

    const spamWordGuidance = `
Avoid spammy phrases like:
- "free", "discount", "act now", "guaranteed", "limited time", "special offer"
- "click here", "buy now", "don't miss out", "urgent", "exclusive deal"
- Overly salesy language that triggers spam filters

Instead, use natural, human language that sounds like a genuine email from one person to another.
`;

    const modeInstructions = {
      more_human: "Make the tone more human and conversational. Remove corporate jargon. Write as if you're a real person reaching out.",
      more_conversational: "Make it sound like a casual conversation. Use natural language, shorter sentences, and friendly phrasing.",
      more_confident: "Make it more assertive and confident, but still professional. Show conviction without being pushy.",
      less_aggressive: "Soften the language. Remove any pushy or aggressive sales language. Make it more consultative and helpful.",
    };

    const lengthGuidance = {
      concise: "Keep it short (50-80 words). Get to the point quickly.",
      medium: "Keep similar length (80-120 words). Balanced detail.",
      expanded: "Make it longer (120-180 words). Add more context and value.",
    };

    const toneGuidance = {
      professional: "Professional and polished tone",
      casual: "Casual and relaxed tone",
      friendly: "Warm and friendly tone",
      direct: "Direct and straightforward tone",
      soft: "Soft and gentle tone",
    };

    const prompt = `
Rewrite this cold email using SmartSend AI Rewriter v2.

### Goals:
1. Improve deliverability by removing spammy phrases.
2. Add natural personalization using the lead details.
3. Follow tone: ${toneGuidance[tone as keyof typeof toneGuidance] || tone || "professional"}
4. Follow length rule: ${lengthGuidance[length as keyof typeof lengthGuidance] || length || "medium"}
5. Apply mode: ${modeInstructions[mode as keyof typeof modeInstructions] || mode || "more_human"}
6. Produce **exactly 3 variants**:
   - Version A: Professional and polished
   - Version B: Casual and conversational
   - Version C: High personalization (use lead details naturally)

${personalization}

${spamWordGuidance}

### Rules:
- Preserve all {{variables}} exactly as they appear (e.g., {{first_name}}, {{company}})
- Do NOT invent new variables or replace existing ones
- Each variant should be meaningfully different in tone/style
- Version C should incorporate lead details naturally (company name, industry, etc.)
- Output ONLY valid JSON, no commentary

Original text:

"""
${text}
"""

Output format (JSON only):

{
  "variants": [
    "Version A: [professional rewrite]",
    "Version B: [casual rewrite]",
    "Version C: [high personalization rewrite]"
  ]
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are SmartSend's AI Template Rewriter v2. You rewrite cold emails to improve deliverability, add personalization, and generate multiple variants. Always return valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.55,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || "{}";
    
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      // Fallback: try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse JSON response");
      }
    }

    // Ensure we have variants array
    if (!parsed.variants || !Array.isArray(parsed.variants)) {
      // Try alternative keys
      if (parsed.variant_a && parsed.variant_b && parsed.variant_c) {
        parsed.variants = [parsed.variant_a, parsed.variant_b, parsed.variant_c];
      } else {
        return NextResponse.json(
          { error: "Invalid response format from AI" },
          { status: 500 }
        );
      }
    }

    // Ensure we have exactly 3 variants
    if (parsed.variants.length < 3) {
      // Pad with duplicates if needed (shouldn't happen, but safety)
      while (parsed.variants.length < 3) {
        parsed.variants.push(parsed.variants[parsed.variants.length - 1] || text);
      }
    }

    return NextResponse.json({
      variants: parsed.variants.slice(0, 3),
    });
  } catch (error) {
    console.error("[Rewriter v2] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to rewrite template",
      },
      { status: 500 }
    );
  }
}










