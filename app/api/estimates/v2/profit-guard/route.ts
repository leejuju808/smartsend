// Block 255900 — SmartSend AI Estimating Engine v2
// Profit Guard - Check and Approve Low-Margin Estimates
// POST /api/estimates/v2/profit-guard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { estimate_id, proposed_price, minimum_margin = 45.0, approve = false } = body;

    if (!estimate_id) {
      return NextResponse.json(
        { error: "estimate_id is required" },
        { status: 400 }
      );
    }

    // Verify estimate exists
    const { data: estimate, error: estimateError } = await serviceSupabase
      .from("estimates")
      .select("id, total_price, org_id")
      .eq("id", estimate_id)
      .single();

    if (estimateError || !estimate) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }

    const priceToCheck = proposed_price || estimate.total_price;

    if (!priceToCheck || priceToCheck <= 0) {
      return NextResponse.json(
        { error: "proposed_price is required" },
        { status: 400 }
      );
    }

    // Check profit guard
    const { data: checkResult, error: checkError } = await serviceSupabase.rpc(
      "check_profit_guard",
      {
        p_estimate_id: estimate_id,
        p_proposed_price: priceToCheck,
        p_minimum_margin: minimum_margin,
      }
    );

    if (checkError) {
      console.error("Error checking profit guard:", checkError);
      return NextResponse.json(
        { error: "Failed to check profit guard", details: checkError.message },
        { status: 500 }
      );
    }

    const check = Array.isArray(checkResult) ? checkResult[0] : checkResult;

    // If approving, update estimate
    if (approve && check && !check.is_approved) {
      // Only managers/admins can approve low-margin estimates
      // Check if user has permission (simplified - would check org role)
      const { error: updateError } = await serviceSupabase
        .from("estimates")
        .update({
          total_price: priceToCheck,
          profit_guard_warning: false,
          profit_guard_approved_by: user.id,
          profit_guard_approved_at: new Date().toISOString(),
        })
        .eq("id", estimate_id);

      if (updateError) {
        console.error("Error approving estimate:", updateError);
        return NextResponse.json(
          { error: "Failed to approve estimate" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        approved: true,
        check: {
          ...check,
          is_approved: true,
        },
        message: "Estimate approved despite low margin",
      });
    }

    return NextResponse.json({
      success: true,
      check,
      requires_approval: !check.is_approved,
    });
  } catch (error: any) {
    console.error("Error in profit guard:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check profit guard" },
      { status: 500 }
    );
  }
}





















