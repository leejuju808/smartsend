// Block 22420 — SmartSend Roofing Insurance Claim Tracker v1
// API Route: Insurance Dashboard Data
// GET /api/dashboard/insurance

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({
        awaiting_acv: [],
        awaiting_rcv: [],
        awaiting_supplement: [],
        missing_depreciation: [],
        unpaid_deductible: [],
      });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Fetch all insurance claims for user's workspaces
    const { data: claims, error: claimsError } = await supabase
      .from("job_insurance_claims")
      .select(`
        *,
        job:roofing_jobs(
          id,
          title,
          status,
          job_value,
          scheduled_start_date,
          scheduled_end_date
        )
      `)
      .in("workspace_id", workspaceIds);

    if (claimsError) {
      console.error("Error fetching insurance claims:", claimsError);
      return NextResponse.json(
        { error: claimsError.message },
        { status: 500 }
      );
    }

    const allClaims = claims || [];

    // Filter claims by status
    const awaiting_acv = allClaims.filter(
      (claim) =>
        claim.claim_status === "awaiting_acv" &&
        (claim.acv_paid || 0) < (claim.acv_amount || 0)
    );

    const awaiting_rcv = allClaims.filter(
      (claim) =>
        claim.claim_status === "awaiting_rcv" &&
        (claim.rcv_paid || 0) < (claim.rcv_amount || 0)
    );

    const awaiting_supplement = allClaims.filter(
      (claim) =>
        claim.claim_status === "awaiting_supplement" &&
        (claim.supplement_requested || 0) > 0 &&
        (claim.supplement_approved || 0) === 0
    );

    // Claims where depreciation hasn't been recovered (RCV - ACV - depreciation should be 0 when complete)
    const missing_depreciation = allClaims.filter((claim) => {
      const rcv = claim.rcv_amount || 0;
      const acv = claim.acv_amount || 0;
      const dep = claim.depreciation_amount || 0;
      const rcvPaid = claim.rcv_paid || 0;
      const acvPaid = claim.acv_paid || 0;

      // If RCV is paid but depreciation hasn't been recovered
      return (
        rcvPaid >= rcv &&
        acvPaid >= acv &&
        dep > 0 &&
        claim.claim_status !== "complete"
      );
    });

    // Claims where homeowner still owes deductible
    const unpaid_deductible = allClaims.filter((claim) => {
      const deductible = claim.deductible || 0;
      return deductible > 0 && claim.claim_status !== "complete";
    });

    return NextResponse.json(
      {
        awaiting_acv,
        awaiting_rcv,
        awaiting_supplement,
        missing_depreciation,
        unpaid_deductible,
        total_claims: allClaims.length,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in insurance dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































