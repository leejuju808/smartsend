// Block 252700 — Real-Time Weather Intelligence Engine
// GET /api/weather/job/[jobId]/status
// Returns current weather status for a job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    // Fetch weather status
    const { data: weatherStatus, error } = await supabase
      .from("job_weather_status")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned
      console.error("Error fetching weather status:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!weatherStatus) {
      return NextResponse.json(
        { error: "Weather status not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(weatherStatus);
  } catch (error: any) {
    console.error("Error in weather status API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























