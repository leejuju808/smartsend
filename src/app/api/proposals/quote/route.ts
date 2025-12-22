// Block 36110 — SmartSend Roofing "Proposal Builder + Instant Quote Engine" v1
// API Route: Instant Quote Engine
// POST /api/proposals/quote

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      roof_size_squares,
      roof_pitch,
      material_type,
      layers_to_tear_off = 1,
      travel_distance_miles = 0,
      waste_factor_percent = 12.0,
      profit_margin_percent = 20.0,
      lead_id,
      workspace_id,
      save_calculation = false,
    } = body;

    // Validate required fields
    if (!roof_size_squares || !material_type) {
      return NextResponse.json(
        { error: "roof_size_squares and material_type are required" },
        { status: 400 }
      );
    }

    // Calculate quote using database function
    const { data: quoteData, error: quoteError } = await supabase.rpc(
      "calculate_instant_quote",
      {
        p_roof_size_squares: parseFloat(roof_size_squares),
        p_roof_pitch: roof_pitch || "medium",
        p_material_type: material_type,
        p_layers_to_tear_off: parseInt(layers_to_tear_off),
        p_travel_distance_miles: parseFloat(travel_distance_miles),
        p_waste_factor_percent: parseFloat(waste_factor_percent),
        p_profit_margin_percent: parseFloat(profit_margin_percent),
      }
    );

    if (quoteError) {
      console.error("Quote calculation error:", quoteError);
      return NextResponse.json(
        { error: "Failed to calculate quote", details: quoteError.message },
        { status: 500 }
      );
    }

    // Save calculation if requested
    if (save_calculation && workspace_id) {
      const { error: saveError } = await supabase
        .from("quote_calculations")
        .insert({
          workspace_id,
          lead_id: lead_id || null,
          roof_size_squares: parseFloat(roof_size_squares),
          roof_pitch: roof_pitch || "medium",
          material_type,
          layers_to_tear_off: parseInt(layers_to_tear_off),
          travel_distance_miles: parseFloat(travel_distance_miles),
          waste_factor_percent: parseFloat(waste_factor_percent),
          material_cost: quoteData.material_cost,
          labor_cost: quoteData.labor_cost,
          tear_off_cost: quoteData.tear_off_cost,
          disposal_cost: quoteData.disposal_cost,
          travel_cost: quoteData.travel_cost,
          total_cost: quoteData.total_cost,
          profit_margin_percent: parseFloat(profit_margin_percent),
          suggested_retail: quoteData.suggested_retail,
          insurance_match_price: quoteData.insurance_match_price,
          calculation_metadata: quoteData,
        });

      if (saveError) {
        console.error("Error saving quote calculation:", saveError);
        // Don't fail the request if save fails
      }
    }

    return NextResponse.json({
      ok: true,
      quote: quoteData,
    });
  } catch (error: any) {
    console.error("Error in /api/proposals/quote:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































