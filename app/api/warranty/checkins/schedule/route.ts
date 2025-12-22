// Block 256100 — Schedule Customer Check-In API
// POST /api/warranty/checkins/schedule
// Schedule automated customer check-ins

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
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      customer_id,
      checkin_type,
      scheduled_date,
      team_id,
    } = body;

    if (!customer_id || !checkin_type || !scheduled_date || !team_id) {
      return NextResponse.json(
        { error: "Missing required fields: customer_id, checkin_type, scheduled_date, team_id" },
        { status: 400 }
      );
    }

    // Validate check-in type
    const validTypes = [
      "annual",
      "seasonal_spring",
      "seasonal_fall",
      "seasonal_winter",
      "storm_followup",
      "warranty_check",
      "maintenance_reminder",
      "roof_age_check",
    ];

    if (!validTypes.includes(checkin_type)) {
      return NextResponse.json(
        { error: `Invalid checkin_type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Schedule check-in using the function
    const { data: checkinId, error: checkinError } = await supabase
      .rpc("schedule_customer_checkin", {
        p_customer_id: customer_id,
        p_checkin_type: checkin_type,
        p_scheduled_date: scheduled_date,
        p_team_id: team_id,
      });

    if (checkinError) {
      console.error("Error scheduling check-in:", checkinError);
      return NextResponse.json(
        { error: checkinError.message || "Failed to schedule check-in" },
        { status: 500 }
      );
    }

    // Get the created check-in
    const { data: checkin, error: fetchError } = await supabase
      .from("customer_checkins")
      .select(`
        *,
        customer:customers(id, name, email, phone),
        job:jobs(id, title)
      `)
      .eq("id", checkinId)
      .single();

    if (fetchError) {
      console.error("Error fetching created check-in:", fetchError);
      return NextResponse.json(
        { error: "Check-in scheduled but failed to fetch details" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        checkin,
        message: "Check-in scheduled successfully",
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in POST /api/warranty/checkins/schedule:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















