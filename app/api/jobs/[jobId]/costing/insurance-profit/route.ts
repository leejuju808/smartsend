// Block 255700 — SmartSend Job Costing & Profit Engine v1
// API Route: Insurance job profit calculator
// GET /api/jobs/[jobId]/costing/insurance-profit - Get insurance profit
// POST /api/jobs/[jobId]/costing/insurance-profit - Calculate/update insurance profit

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET insurance job profit
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get insurance job profit
    const { data: insuranceProfit, error } = await supabase
      .from("insurance_job_profits")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching insurance profit:", error);
      return NextResponse.json(
        { error: "Failed to fetch insurance profit" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      insurance_profit: insuranceProfit || null,
    });
  } catch (error: any) {
    console.error("Error in get insurance profit:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST calculate/update insurance job profit
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      acv_paid,
      depreciation,
      deductible_collected,
      supplements_approved,
    } = body;

    // Call calculate_insurance_job_profit function
    const { data: result, error: calcError } = await supabase.rpc(
      "calculate_insurance_job_profit",
      { p_job_id: jobId }
    );

    if (calcError) {
      console.error("Error calculating insurance profit:", calcError);
      return NextResponse.json(
        {
          error: "Failed to calculate insurance profit",
          details: calcError.message,
        },
        { status: 500 }
      );
    }

    // If custom values provided, update them
    if (
      acv_paid !== undefined ||
      depreciation !== undefined ||
      deductible_collected !== undefined ||
      supplements_approved !== undefined
    ) {
      const updateData: any = {};
      if (acv_paid !== undefined) updateData.acv_paid = acv_paid;
      if (depreciation !== undefined) updateData.depreciation = depreciation;
      if (deductible_collected !== undefined)
        updateData.deductible_collected = deductible_collected;
      if (supplements_approved !== undefined)
        updateData.supplements_approved = supplements_approved;

      // Recalculate total_paid
      const { data: current } = await supabase
        .from("insurance_job_profits")
        .select("acv_paid, depreciation, deductible_collected, supplements_approved")
        .eq("job_id", jobId)
        .single();

      if (current) {
        updateData.total_paid =
          (updateData.acv_paid ?? current.acv_paid ?? 0) +
          (updateData.depreciation ?? current.depreciation ?? 0) +
          (updateData.deductible_collected ?? current.deductible_collected ?? 0) +
          (updateData.supplements_approved ?? current.supplements_approved ?? 0);
      }

      await supabase
        .from("insurance_job_profits")
        .update(updateData)
        .eq("job_id", jobId);
    }

    return NextResponse.json({
      success: true,
      calculation: result,
    });
  } catch (error: any) {
    console.error("Error in calculate insurance profit:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















