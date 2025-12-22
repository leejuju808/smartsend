// Block 21912 — SmartSend Roofing Job Probability Explainer v1
// API Route: Generate probability explanation for a lead

import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json();

    if (!lead_id) {
      return NextResponse.json(
        { error: "Missing lead_id" },
        { status: 400 }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Construct edge function URL
    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/generate-probability-explanation`;

    // Call the edge function
    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ lead_id }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Edge function error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate explanation", details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({
      ok: true,
      explanation: result.explanation,
      confidence: result.confidence,
    });
  } catch (error: any) {
    console.error("Generate probability explanation error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}









































