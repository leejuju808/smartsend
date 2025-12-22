// Block 253900 — SmartSend Customer Experience Engine v1
// POST /api/homeowner/generate-photo-explanation
// Generate AI photo explanation for homeowners (simple language)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { photo_id, job_id, photo_url, photo_category, job_photo_entry_id } = body;

    if (!photo_url || !job_id) {
      return NextResponse.json(
        { error: "Photo URL and job ID are required" },
        { status: 400 }
      );
    }

    // Check if explanation already exists
    const existingExplanation = await supabase
      .from("photo_explanations")
      .select("*")
      .eq("job_id", job_id)
      .or(
        `photo_id.eq.${photo_id || "null"},job_photo_entry_id.eq.${job_photo_entry_id || "null"}`
      )
      .single();

    if (existingExplanation.data) {
      return NextResponse.json({
        ok: true,
        explanation: existingExplanation.data.homeowner_explanation,
        existing: true,
      });
    }

    // Generate AI explanation using OpenAI
    const systemPrompt = `You are SmartSend AI Photo Explanation Assistant. Your job is to explain roofing photos in SIMPLE, friendly language that homeowners can understand.

Guidelines:
- Use everyday language, not technical jargon
- Be friendly and reassuring
- Explain what's happening in the photo
- Keep it brief (1-2 sentences)
- Focus on what the homeowner cares about (progress, quality, safety)

Photo category: ${photo_category || "general"}

Generate a simple, friendly explanation for this roofing photo.`;

    const userPrompt = `Explain this roofing photo in simple language for a homeowner:
${photo_category ? `Category: ${photo_category}` : ""}

What's happening in this photo? Explain it like you're talking to a friend who doesn't know anything about roofing.`;

    let aiExplanation: string;

    try {
      // Try to use OpenAI Vision API if we have image URL
      if (photo_url && photo_url.startsWith("http")) {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                {
                  type: "image_url",
                  image_url: { url: photo_url },
                },
              ],
            },
          ],
          max_tokens: 150,
          temperature: 0.7,
        });

        aiExplanation =
          response.choices[0]?.message?.content ||
          "This photo shows progress on your roof project.";
      } else {
        // Fallback: Use category-based explanation
        aiExplanation = await generateCategoryBasedExplanation(photo_category);
      }
    } catch (error) {
      console.error("Error calling OpenAI:", error);
      // Fallback to category-based explanation
      aiExplanation = await generateCategoryBasedExplanation(photo_category);
    }

    // Save explanation to database
    const { data: explanation, error: explanationError } = await supabase
      .from("photo_explanations")
      .insert({
        photo_id: photo_id || null,
        job_photo_entry_id: job_photo_entry_id || null,
        job_id,
        homeowner_explanation: aiExplanation,
        technical_details: null,
        ai_generated: true,
      })
      .select()
      .single();

    if (explanationError) {
      console.error("Error saving explanation:", explanationError);
      // Still return the explanation even if save fails
      return NextResponse.json({
        ok: true,
        explanation: aiExplanation,
      });
    }

    return NextResponse.json({
      ok: true,
      explanation: aiExplanation,
      explanation_id: explanation.id,
    });
  } catch (error: any) {
    console.error("Error in photo explanation API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Fallback function for category-based explanations
async function generateCategoryBasedExplanation(
  category: string | null
): Promise<string> {
  const explanations: Record<string, string> = {
    before:
      "This photo shows your roof before we started work. This helps us document the original condition.",
    during:
      "This photo shows work in progress. Our crew is actively working on your roof.",
    after: "This photo shows the completed work. Your new roof is installed and ready.",
    tear_off:
      "This photo shows the tear-off process. We're removing your old roof to prepare for the new installation.",
    underlayment:
      "This photo shows the underlayment being installed. It protects your roof deck from moisture and is required before shingles go on.",
    decking:
      "This photo shows the roof deck inspection. We check for any damage or rot that needs repair before installing the new roof.",
    install:
      "This photo shows the shingle installation in progress. Our crew is installing your new roofing materials.",
    ridge_caps:
      "This photo shows the installation of ridge caps on the roof peak. These help ventilate your attic and finish the roof system.",
    cleanup:
      "This photo shows our cleanup process. We're making sure your property is clean and safe.",
  };

  return (
    explanations[category || ""] ||
    "This photo shows progress on your roof project. Our crew is working to complete your installation."
  );
}
























