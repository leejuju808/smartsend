// Block 255900 — SmartSend AI Estimating Engine v2
// Complete Estimate Calculation
// POST /api/estimates/v2/calculate

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
    const {
      estimate_id,
      squares,
      pitch,
      facets = 4,
      valleys = 0,
      hips = 0,
      eaves_length_ft = 0,
      ridge_length_ft = 0,
      tear_off_layers = 1,
      crew_strength = 4,
      old_material_type = "asphalt",
      overhead_percentage = 15.0,
      target_margin = 50.0,
      supplier_id = null,
      company_id = null,
    } = body;

    if (!estimate_id) {
      return NextResponse.json(
        { error: "estimate_id is required" },
        { status: 400 }
      );
    }

    // Verify estimate exists
    const { data: estimate, error: estimateError } = await serviceSupabase
      .from("estimates")
      .select("id, org_id")
      .eq("id", estimate_id)
      .single();

    if (estimateError || !estimate) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }

    // Get company_id from estimate (could be org_id or company_id)
    const estimateCompanyId = company_id || estimate.org_id || (estimate as any).company_id;

    // Call the database function to calculate complete estimate
    const { data: result, error: calcError } = await serviceSupabase.rpc(
      "calculate_complete_estimate",
      {
        p_estimate_id: estimate_id,
        p_squares: squares,
        p_pitch: pitch,
        p_facets: facets,
        p_valleys: valleys,
        p_hips: hips,
        p_eaves_length_ft: eaves_length_ft,
        p_ridge_length_ft: ridge_length_ft,
        p_tear_off_layers: tear_off_layers,
        p_crew_strength: crew_strength,
        p_old_material_type: old_material_type,
        p_overhead_percentage: overhead_percentage,
        p_target_margin: target_margin,
        p_supplier_id: supplier_id,
        p_company_id: estimateCompanyId,
      }
    );

    if (calcError) {
      console.error("Error calculating estimate:", calcError);
      return NextResponse.json(
        { error: "Failed to calculate estimate", details: calcError.message },
        { status: 500 }
      );
    }

    // Get updated estimate
    const { data: updatedEstimate, error: fetchError } = await serviceSupabase
      .from("estimates")
      .select("*")
      .eq("id", estimate_id)
      .single();

    if (fetchError) {
      console.error("Error fetching updated estimate:", fetchError);
    }

    return NextResponse.json({
      success: true,
      result,
      estimate: updatedEstimate,
    });
  } catch (error: any) {
    console.error("Error in calculate estimate:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate estimate" },
      { status: 500 }
    );
  }
}





















