// Block 28060 — SmartSend Roofing Review & Referral Engine v1
// API Route: Submit Referral
// Public endpoint for referral form submissions

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { referral_code, name, email, phone } = body;

    if (!referral_code || !name || !email) {
      return NextResponse.json(
        { error: "referral_code, name, and email are required" },
        { status: 400 }
      );
    }

    // Call edge function to create referral lead
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/create-referral-lead`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          referral_code,
          name,
          email,
          phone: phone || null,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to submit referral" },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    console.error("Error submitting referral:", error);
    return NextResponse.json(
      { error: error.message || "Failed to submit referral" },
      { status: 500 }
    );
  }
}


































