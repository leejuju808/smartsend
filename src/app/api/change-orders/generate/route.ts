// Block 37990 — AI Change Order Generator
// POST /api/change-orders/generate
// Generates a change order using AI based on issue description and photos

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { job_id, issue_text, photos } = await req.json();

    if (!job_id || !issue_text) {
      return NextResponse.json(
        { error: "job_id and issue_text are required" },
        { status: 400 }
      );
    }

    // Verify job exists and get lead info
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(`
        id,
        lead_id,
        contract_value,
        leads (
          id,
          first_name,
          last_name,
          phone,
          email
        )
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Generate change order description using AI
    const prompt = `You are a professional roofing contractor assistant. Draft a clear, professional change order description for a homeowner.

Issue discovered: ${issue_text}

Create a change order that includes:
1. A clear, homeowner-friendly explanation of the issue
2. Scope of additional work required
3. Additional materials needed (if any)
4. Additional labor required
5. Professional tone that builds trust

Keep it concise (2-3 sentences max) and avoid technical jargon. Make it clear why this additional work is necessary.

Return ONLY the description text, no formatting.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a professional roofing contractor assistant. Write clear, homeowner-friendly change order descriptions.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const description = completion.choices[0]?.message?.content || issue_text;

    // Estimate amount (v1: rough estimate based on common roofing issues)
    // In production, this could be more sophisticated with material/labor calculations
    let estimatedAmount = 150; // Base minimum
    
    const issueLower = issue_text.toLowerCase();
    if (issueLower.includes("rot") || issueLower.includes("rotten") || issueLower.includes("decking")) {
      estimatedAmount = 450;
    } else if (issueLower.includes("extra layer") || issueLower.includes("tear-off")) {
      estimatedAmount = 350;
    } else if (issueLower.includes("flashing") || issueLower.includes("ventilation")) {
      estimatedAmount = 280;
    } else if (issueLower.includes("dump") || issueLower.includes("disposal")) {
      estimatedAmount = 120;
    } else if (issueLower.includes("upgrade") || issueLower.includes("better")) {
      estimatedAmount = 400;
    } else if (issueLower.includes("labor") || issueLower.includes("hours")) {
      estimatedAmount = 250;
    }

    // Create change order
    const { data: changeOrder, error: coError } = await supabase
      .from("change_orders")
      .insert({
        job_id,
        description,
        amount: estimatedAmount,
        status: "pending",
        details: {
          issue: issue_text,
          ai_generated: true,
          estimated: true,
        },
      })
      .select()
      .single();

    if (coError || !changeOrder) {
      console.error("Error creating change order:", coError);
      return NextResponse.json(
        { error: "Failed to create change order" },
        { status: 500 }
      );
    }

    // Store photos if provided
    if (photos && Array.isArray(photos) && photos.length > 0) {
      const photoInserts = photos.map((photo: { url: string; label?: string }) => ({
        change_order_id: changeOrder.id,
        photo_url: photo.url,
        label: photo.label || null,
      }));

      const { error: photoError } = await supabase
        .from("change_order_photos")
        .insert(photoInserts);

      if (photoError) {
        console.error("Error storing photos:", photoError);
        // Don't fail the request, photos are optional
      }
    }

    return NextResponse.json({
      ok: true,
      change_order: changeOrder,
    });
  } catch (error: any) {
    console.error("Error generating change order:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate change order" },
      { status: 500 }
    );
  }
}
































