// GET /api/crew/service-jobs
// Get service jobs assigned to a crew for today

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { searchParams } = req.nextUrl;
    const crewId = searchParams.get("crew_id");
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    if (!crewId) {
      return NextResponse.json(
        { error: "crew_id is required" },
        { status: 400 }
      );
    }

    // Get service assignments for this crew on this date
    const { data: assignments, error: assignmentsError } = await supabase
      .from("service_assignments")
      .select(`
        *,
        ticket:service_tickets(
          *,
          homeowner:homeowners(*),
          job:roofing_jobs(*)
        )
      `)
      .eq("crew_id", crewId)
      .eq("scheduled_date", date)
      .in("status", ["scheduled", "en_route", "on_site"]);

    if (assignmentsError) {
      console.error("Error fetching service assignments:", assignmentsError);
      return NextResponse.json(
        { error: assignmentsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      service_jobs: assignments || [],
    });
  } catch (error: any) {
    console.error("Error in crew/service-jobs:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























