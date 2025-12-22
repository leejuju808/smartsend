// Block 51000 — SmartSend Roofing Crew Payroll + Labor Cost Tracking System v1
// API Route: Calculate Piecework
// POST /api/payroll/piecework

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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

    const body = await req.json();
    const {
      member_id,
      job_id,
      squares,
      ridge_feet,
      plywood_sheets,
      vents_count,
      removal_squares,
      additional_items,
      photos,
    } = body;

    if (!member_id || !job_id) {
      return NextResponse.json(
        { error: "member_id and job_id are required" },
        { status: 400 }
      );
    }

    // Check if piecework record already exists
    const { data: existing } = await supabase
      .from("piecework_records")
      .select("*")
      .eq("member_id", member_id)
      .eq("job_id", job_id)
      .single();

    const recordData: any = {
      member_id,
      job_id,
      squares: squares || 0,
      ridge_feet: ridge_feet || 0,
      plywood_sheets: plywood_sheets || 0,
      vents_count: vents_count || 0,
      removal_squares: removal_squares || 0,
      additional_items: additional_items || {},
      photos: photos || [],
    };

    let data;
    let error;

    if (existing) {
      // Update existing record
      const result = await supabase
        .from("piecework_records")
        .update(recordData)
        .eq("id", existing.id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Create new record
      const result = await supabase
        .from("piecework_records")
        .insert(recordData)
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      return NextResponse.json(
        { error: "Failed to save piecework record", details: error.message },
        { status: 500 }
      );
    }

    // The trigger will automatically calculate total_pay
    return NextResponse.json({
      success: true,
      piecework_record: data,
      message: "Piecework calculated",
      total_pay: data.total_pay,
    });
  } catch (error: any) {
    console.error("Error in piecework API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































