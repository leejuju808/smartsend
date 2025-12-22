// Block 255500 — SmartSend Repair Division Engine v1
// GET /api/repairs/[id]
// Get single repair request with full details

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get repair request with related data
    const { data: repairRequest, error: requestError } = await supabase
      .from("repair_requests")
      .select(
        `
        *,
        customers(id, name, email, phone, address, city, state, zip_code),
        repair_jobs(
          id,
          tech_id,
          scheduled_time,
          scheduled_date,
          price,
          price_breakdown,
          status,
          work_performed,
          findings,
          materials_used,
          photos_before,
          photos_during,
          photos_after,
          completed_at,
          actual_duration_minutes,
          customer_satisfaction_score,
          customer_feedback,
          payment_status,
          crew_members(id, name, phone, role)
        ),
        repair_warranties(
          id,
          warranty_length_days,
          warranty_type,
          warranty_starts_at,
          warranty_ends_at,
          covered_items,
          is_active
        )
      `
      )
      .eq("id", id)
      .single();

    if (requestError || !repairRequest) {
      return NextResponse.json(
        { error: "Repair request not found" },
        { status: 404 }
      );
    }

    // Get assigned tech details if assigned
    let assignedTech = null;
    if (repairRequest.assigned_tech_id) {
      const { data: tech } = await supabase
        .from("crew_members")
        .select("id, name, phone, role")
        .eq("id", repairRequest.assigned_tech_id)
        .single();

      assignedTech = tech;
    }

    // Get pricing for predicted repair type
    let pricing = null;
    if (repairRequest.ai_predicted_repair_type) {
      const { data: priceData } = await supabase
        .from("repair_pricing_matrix")
        .select("*")
        .eq("team_id", repairRequest.team_id)
        .eq("repair_type", repairRequest.ai_predicted_repair_type)
        .eq("is_active", true)
        .single();

      pricing = priceData;
    }

    return NextResponse.json({
      success: true,
      repair_request: {
        ...repairRequest,
        assigned_tech: assignedTech,
        pricing,
      },
    });
  } catch (error: any) {
    console.error("Error in get repair request API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















