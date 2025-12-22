// Block 252700 — Real-Time Weather Intelligence Engine
// GET /api/weather/dashboard
// Returns weather status for all active jobs (for office dashboard)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const filter = searchParams.get("filter") || "all";

    // Fetch weather status for all active jobs
    const { data: weatherStatuses, error: weatherError } = await supabase
      .from("job_weather_status")
      .select("*, jobs:job_id(id, homeowner_name, address, production_date, scheduled_start_date)");

    if (weatherError) {
      console.error("Error fetching weather statuses:", weatherError);
      return NextResponse.json(
        { error: weatherError.message },
        { status: 500 }
      );
    }

    // Fetch job details
    const jobIds = (weatherStatuses || [])
      .map((ws) => ws.job_id)
      .filter((id): id is string => id !== null);

    if (jobIds.length === 0) {
      return NextResponse.json({ jobs: [] });
    }

    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select("id, homeowner_name, address, production_date")
      .in("id", jobIds)
      .in("stage", ["scheduled", "in_progress"]);

    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
    }

    // Combine data
    const jobsWithWeather = (weatherStatuses || []).map((ws) => {
      const job = (jobs || []).find((j) => j.id === ws.job_id);
      return {
        job_id: ws.job_id,
        homeowner_name: job?.homeowner_name || ws.jobs?.homeowner_name,
        address: job?.address || ws.jobs?.address,
        production_date: job?.production_date || ws.jobs?.production_date,
        scheduled_start_date: ws.jobs?.scheduled_start_date,
        risk_level: ws.risk_level,
        current_risk_score: ws.current_risk_score,
        current_heat_index_f: ws.current_heat_index_f,
        current_wind_speed_mph: ws.current_wind_speed_mph,
        current_rain_probability: ws.current_rain_probability,
        next_48h_max_risk_score: ws.next_48h_max_risk_score,
        next_48h_worst_conditions: ws.next_48h_worst_conditions,
        updated_at: ws.updated_at,
      };
    });

    // Apply filter
    let filteredJobs = jobsWithWeather;
    if (filter === "high_risk") {
      filteredJobs = jobsWithWeather.filter(
        (j) => j.risk_level === "high_risk" || (j.current_risk_score || 0) >= 70
      );
    } else if (filter === "caution") {
      filteredJobs = jobsWithWeather.filter(
        (j) => j.risk_level === "caution" || ((j.current_risk_score || 0) >= 40 && (j.current_risk_score || 0) < 70)
      );
    }

    return NextResponse.json({ jobs: filteredJobs });
  } catch (error: any) {
    console.error("Error in weather dashboard API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























