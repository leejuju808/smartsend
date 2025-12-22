/**
 * Block 25300 — SmartSend Roofing Weather Intelligence v1
 * GET /api/weather/risk-score?job_id=xxx&date=YYYY-MM-DD
 * Returns weather risk score for a job or location/date
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);

    const jobId = searchParams.get("job_id");
    const date = searchParams.get("date");
    const zip = searchParams.get("zip");

    if (!jobId && !date) {
      return NextResponse.json(
        { error: "job_id or date required" },
        { status: 400 }
      );
    }

    // Get user workspace
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "No workspace" }, { status: 403 });
    }

    // If job_id provided, get risk scores for that job
    if (jobId) {
      const { data: riskScores, error } = await supabase
        .from("weather_risk_scores")
        .select("*")
        .eq("workspace_id", membership.workspace_id)
        .eq("job_id", jobId)
        .order("forecast_datetime", { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ risk_scores: riskScores || [] });
    }

    // If date + zip provided, get risk scores for that location/date
    if (date && zip) {
      const { data: riskScores, error } = await supabase
        .from("weather_risk_scores")
        .select("*")
        .eq("workspace_id", membership.workspace_id)
        .eq("location_zip", zip)
        .eq("forecast_date", date)
        .order("forecast_hour", { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ risk_scores: riskScores || [] });
    }

    return NextResponse.json(
      { error: "Invalid parameters" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Error fetching weather risk score:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}




































