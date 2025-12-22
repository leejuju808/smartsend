// Block 180000 — SmartSend Roofing AI Insurance Claim Assistant v1
// API Route: Email Adjuster
// POST /api/jobs/[jobId]/insurance-claim/email-adjuster

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
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
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    if (!claim.adjuster_email) {
      return NextResponse.json(
        { error: "Adjuster email not set for this claim" },
        { status: 400 }
      );
    }

    // Get line items
    const { data: lineItems } = await supabase
      .from("claim_line_items")
      .select("*")
      .eq("claim_id", claim.id)
      .order("created_at", { ascending: true });

    // Here you would integrate with your email service (Resend, SendGrid, etc.)
    // For now, return success
    return NextResponse.json({
      success: true,
      message: "Email would be sent to adjuster",
      adjuster_email: claim.adjuster_email,
    });
  } catch (error: any) {
    console.error("Error in email-adjuster:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























