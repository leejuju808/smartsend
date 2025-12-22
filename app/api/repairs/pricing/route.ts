// Block 255500 — SmartSend Repair Division Engine v1
// GET/POST /api/repairs/pricing
// Repair Pricing Matrix management

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET - Retrieve pricing matrix for team
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const team_id = searchParams.get("team_id");
    const category = searchParams.get("category");
    const include_inactive = searchParams.get("include_inactive") === "true";

    if (!team_id) {
      return NextResponse.json(
        { error: "team_id is required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("repair_pricing_matrix")
      .select("*")
      .eq("team_id", team_id);

    if (!include_inactive) {
      query = query.eq("is_active", true);
    }

    if (category) {
      query = query.eq("repair_category", category);
    }

    query = query.order("repair_category", { ascending: true })
      .order("repair_type", { ascending: true });

    const { data: pricing, error: pricingError } = await query;

    if (pricingError) {
      return NextResponse.json(
        { error: "Failed to fetch pricing", details: pricingError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      pricing: pricing || [],
      count: pricing?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in get repair pricing API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create or update pricing entry
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      team_id,
      repair_type,
      repair_category,
      base_price,
      price_min,
      price_max,
      labor_cost,
      material_cost,
      travel_cost,
      estimated_time_minutes,
      estimated_time_min,
      estimated_time_max,
      skill_level_required,
      typical_materials,
      description,
      notes,
      is_active = true,
    } = body;

    if (!team_id || !repair_type || !repair_category || !base_price) {
      return NextResponse.json(
        {
          error:
            "team_id, repair_type, repair_category, and base_price are required",
        },
        { status: 400 }
      );
    }

    // Check if pricing already exists for this repair type
    const { data: existing } = await supabase
      .from("repair_pricing_matrix")
      .select("id")
      .eq("team_id", team_id)
      .eq("repair_type", repair_type)
      .eq("is_active", true)
      .single();

    if (existing) {
      // Update existing
      const { data: updated, error: updateError } = await supabase
        .from("repair_pricing_matrix")
        .update({
          repair_category,
          base_price,
          price_min: price_min || null,
          price_max: price_max || null,
          labor_cost: labor_cost || null,
          material_cost: material_cost || null,
          travel_cost: travel_cost || 0,
          estimated_time_minutes: estimated_time_minutes || null,
          estimated_time_min: estimated_time_min || null,
          estimated_time_max: estimated_time_max || null,
          skill_level_required: skill_level_required || null,
          typical_materials: typical_materials || null,
          description: description || null,
          notes: notes || null,
          is_active,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateError) {
        return NextResponse.json(
          {
            error: "Failed to update pricing",
            details: updateError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        pricing: updated,
        action: "updated",
      });
    } else {
      // Create new
      const { data: created, error: createError } = await supabase
        .from("repair_pricing_matrix")
        .insert({
          team_id,
          repair_type,
          repair_category,
          base_price,
          price_min: price_min || null,
          price_max: price_max || null,
          labor_cost: labor_cost || null,
          material_cost: material_cost || null,
          travel_cost: travel_cost || 0,
          estimated_time_minutes: estimated_time_minutes || null,
          estimated_time_min: estimated_time_min || null,
          estimated_time_max: estimated_time_max || null,
          skill_level_required: skill_level_required || null,
          typical_materials: typical_materials || null,
          description: description || null,
          notes: notes || null,
          is_active,
        })
        .select("*")
        .single();

      if (createError) {
        return NextResponse.json(
          {
            error: "Failed to create pricing",
            details: createError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        pricing: created,
        action: "created",
      });
    }
  } catch (error: any) {
    console.error("Error in create/update repair pricing API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















