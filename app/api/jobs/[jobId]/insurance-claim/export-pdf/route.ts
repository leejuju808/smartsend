// Block 180000 — SmartSend Roofing AI Insurance Claim Assistant v1
// API Route: Export Scope to PDF
// GET /api/jobs/[jobId]/insurance-claim/export-pdf

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
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

    // Get claim and line items
    const { data: claim } = await supabase
      .from("insurance_claims")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    const { data: lineItems } = await supabase
      .from("claim_line_items")
      .select("*")
      .eq("claim_id", claim.id)
      .order("created_at", { ascending: true });

    // Generate simple PDF (you can use a library like pdfkit or puppeteer)
    // For now, return JSON that can be converted to PDF on the client
    const pdfData = {
      claim: {
        claim_number: claim.claim_number || "N/A",
        insurance_carrier: claim.insurance_carrier || "N/A",
        policy_holder: claim.policy_holder || "N/A",
        deductible: claim.deductible || 0,
        rcv: claim.rcv || 0,
        acv: claim.acv || 0,
        depreciation: claim.depreciation || 0,
      },
      line_items: lineItems || [],
      totals: {
        subtotal: lineItems?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0,
        rcv: claim.rcv || 0,
        acv: claim.acv || 0,
        depreciation: claim.depreciation || 0,
        deductible: claim.deductible || 0,
        net_claim: (claim.rcv || 0) - (claim.deductible || 0),
      },
    };

    // Return as JSON for now (you can implement actual PDF generation)
    return NextResponse.json(pdfData, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="claim-${claim.claim_number || "scope"}.json"`,
      },
    });
  } catch (error: any) {
    console.error("Error in export-pdf:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























