// Block 180000 — SmartSend Roofing AI Insurance Claim Assistant v1
// API Route: Generate Supplement with AI
// POST /api/jobs/[jobId]/insurance-claim/generate-supplement

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const body = await req.json();
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get claim
    const { data: claim } = await supabase
      .from("insurance_claims")
      .select("id")
      .eq("job_id", jobId)
      .single();

    if (!claim) {
      return NextResponse.json(
        { error: "Claim not found. Create a claim first." },
        { status: 404 }
      );
    }

    // Get existing line items
    const { data: existingLineItems } = await supabase
      .from("claim_line_items")
      .select("code, description, category")
      .eq("claim_id", claim.id);

    // Call edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const response = await fetch(
      `${supabaseUrl}/functions/v1/generate-supplement`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          claim_id: claim.id,
          missing_items: body.missing_items || [],
          code_required_upgrades: body.code_required_upgrades || [],
          photos: body.photos || [],
          scope_notes: body.scope_notes || null,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to generate supplement" },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error("Error in generate-supplement:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























