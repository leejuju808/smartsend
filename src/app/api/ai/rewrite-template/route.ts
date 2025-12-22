import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { canEditCampaign } from "@/lib/authz/can";
import { logActivity } from "@/lib/log";
import { getCurrentWorkspaceId } from "@/lib/workspace";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Tone = "casual" | "friendly" | "professional" | "direct";
type Length = "short" | "medium" | "long";

interface RewriteRequest {
  body: string;
  tone: Tone;
  length: Length;
  brandVoice: boolean;
  campaignId?: string;
  stepIndex?: number;
}

/**
 * Extract all placeholders from text (e.g., {{first_name}}, {{company}})
 */
function extractPlaceholders(text: string): string[] {
  const matches = text.match(/{{[^}]+}}/g) || [];
  return [...new Set(matches)]; // Remove duplicates
}

/**
 * Validate that all placeholders from original are present in rewritten
 */
function validatePlaceholders(original: string, rewritten: string): { valid: boolean; missing: string[] } {
  const originalPlaceholders = extractPlaceholders(original);
  const missing: string[] = [];

  for (const placeholder of originalPlaceholders) {
    if (!rewritten.includes(placeholder)) {
      missing.push(placeholder);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Parse AI response into 3 variants (A, B, C)
 */
function parseVariants(response: string): { A: string; B: string; C: string } | null {
  // Try to extract variants labeled A, B, C
  const variantPatterns = [
    /Variant\s+A[:\-]?\s*\n(.*?)(?=Variant\s+B|$)/is,
    /Variant\s+B[:\-]?\s*\n(.*?)(?=Variant\s+C|$)/is,
    /Variant\s+C[:\-]?\s*\n(.*?)$/is,
  ];

  const variantA = response.match(/Variant\s+A[:\-]?\s*\n(.*?)(?=Variant\s+B|$)/is)?.[1]?.trim();
  const variantB = response.match(/Variant\s+B[:\-]?\s*\n(.*?)(?=Variant\s+C|$)/is)?.[1]?.trim();
  const variantC = response.match(/Variant\s+C[:\-]?\s*\n(.*?)$/is)?.[1]?.trim();

  // Alternative patterns: A:, B:, C: or just numbered sections
  if (!variantA || !variantB || !variantC) {
    // Try splitting by common separators
    const sections = response.split(/\n\s*[-=]{3,}\s*\n|\n\s*(?=Variant|A:|B:|C:)/i);
    if (sections.length >= 3) {
      return {
        A: sections[0]?.replace(/^(Variant\s+)?A[:\-]?\s*/i, "").trim() || "",
        B: sections[1]?.replace(/^(Variant\s+)?B[:\-]?\s*/i, "").trim() || "",
        C: sections[2]?.replace(/^(Variant\s+)?C[:\-]?\s*/i, "").trim() || "",
      };
    }
  }

  if (variantA && variantB && variantC) {
    return { A: variantA, B: variantB, C: variantC };
  }

  // Fallback: split into 3 roughly equal parts
  const lines = response.split("\n").filter((l) => l.trim());
  if (lines.length >= 3) {
    const chunkSize = Math.ceil(lines.length / 3);
    return {
      A: lines.slice(0, chunkSize).join("\n"),
      B: lines.slice(chunkSize, chunkSize * 2).join("\n"),
      C: lines.slice(chunkSize * 2).join("\n"),
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bodyJson: RewriteRequest = await req.json();
    const { body, tone, length, brandVoice, campaignId, stepIndex } = bodyJson;

    if (!body || !tone || !length) {
      return NextResponse.json(
        { error: "Missing required fields: body, tone, length" },
        { status: 400 }
      );
    }

    // Permission check: if campaignId is provided, verify user can edit
    if (campaignId) {
      const canEdit = await canEditCampaign(campaignId, user.id);
      if (!canEdit) {
        return NextResponse.json(
          { error: "You don't have permission to rewrite templates for this campaign" },
          { status: 403 }
        );
      }
    }

    if (!["casual", "friendly", "professional", "direct"].includes(tone)) {
      return NextResponse.json(
        { error: "Invalid tone. Must be: casual, friendly, professional, or direct" },
        { status: 400 }
      );
    }

    if (!["short", "medium", "long"].includes(length)) {
      return NextResponse.json(
        { error: "Invalid length. Must be: short, medium, or long" },
        { status: 400 }
      );
    }

    // Extract placeholders from original
    const originalPlaceholders = extractPlaceholders(body);

    // Build prompt
    const lengthInstruction =
      length === "short"
        ? "Make it shorter and tighter. Best for cold email."
        : length === "long"
        ? "Expand slightly while keeping it a cold email."
        : "Keep roughly the same length.";

    const brandVoiceInstruction = brandVoice
      ? `Apply SmartSend brand voice: crisp, direct, confident, clean formatting, non-spammy, short sentences, no corporate fluff, 1 CTA, 1 hook, avoid trigger words like "free," "special offer," "guarantee," "limited time".`
      : "No specific brand voice.";

    const prompt = `Rewrite this cold email while preserving ALL personalization placeholders (like {{first_name}}, {{company}}, etc).

Email:
${body}

Rules:
- Tone: ${tone}
- Length: ${lengthInstruction}
- Brand voice: ${brandVoiceInstruction}
- Remove weak/spam phrases
- Improve clarity and flow
- Make CTA 1 sentence max
- Reduce filler words
- Keep structure tight
- Scan for and remove: all caps, exclamation spam, filler phrases, hyperbolic claims, spam words ("guaranteed", "limited time", "risk-free", etc.), too many links, too many adjectives

CRITICAL: Preserve ALL placeholders exactly as they appear: ${originalPlaceholders.join(", ")}

Respond with THREE variants labeled A, B, and C. Each variant should be clearly separated.

Format:
Variant A:
[rewritten email A]

Variant B:
[rewritten email B]

Variant C:
[rewritten email C]

Ensure ALL placeholders remain intact in all three variants.`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a cold email copywriter rewriting templates while preserving merge tags. Always return 3 variants labeled A, B, and C.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });

    const rawResponse = completion.choices[0]?.message?.content || "";

    if (!rawResponse) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    // Parse variants
    const variants = parseVariants(rawResponse);

    if (!variants) {
      return NextResponse.json(
        { error: "Failed to parse variants from AI response" },
        { status: 500 }
      );
    }

    // Validate placeholders for each variant
    const validationResults = {
      A: validatePlaceholders(body, variants.A),
      B: validatePlaceholders(body, variants.B),
      C: validatePlaceholders(body, variants.C),
    };

    // Check if any variant is missing placeholders
    const allValid = Object.values(validationResults).every((v) => v.valid);

    if (!allValid) {
      // Log warning but still return variants
      console.warn("[rewrite-template] Some placeholders missing:", validationResults);
    }

    // Log activity if campaignId is provided
    if (campaignId) {
      try {
        // Get workspaceId from campaign
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("workspace_id")
          .eq("id", campaignId)
          .single();

        const workspaceId = campaign?.workspace_id || await getCurrentWorkspaceId();
        
        if (workspaceId) {
          await logActivity({
            workspaceId,
            type: "campaign",
            subtype: "ai_template_rewrite",
            actorId: user.id,
            campaignId,
            stepId: stepIndex?.toString() || null,
            metadata: {
              tone,
              length,
              brandVoice,
              variantsGenerated: 3,
            },
          });
        }
      } catch (logError) {
        // Don't fail the request if logging fails
        console.error("[rewrite-template] Failed to log activity:", logError);
      }
    }

    return NextResponse.json({
      result: {
        A: variants.A,
        B: variants.B,
        C: variants.C,
      },
      validation: validationResults,
      warnings: allValid
        ? []
        : [
            "Warning: Some placeholders may be missing. Please review carefully.",
          ],
    });
  } catch (error: any) {
    console.error("[rewrite-template] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

