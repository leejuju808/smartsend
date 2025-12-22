// GET /v1/roofing/weather/risk - Get weather risk for jobs

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = req.nextUrl;
  const job_id = searchParams.get("job_id");
  const address = searchParams.get("address");
  const date = searchParams.get("date"); // Optional date to check

  if (!job_id && !address) {
    throw new ApiError("400_INVALID_BODY", "job_id or address is required");
  }

  // Get job address if job_id provided
  let jobAddress = address;
  if (job_id) {
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("address")
      .eq("id", job_id)
      .eq("workspace_id", auth.workspaceId)
      .single();

    if (!job) {
      throw new ApiError("404_NOT_FOUND", "Job not found", 404);
    }

    jobAddress = job.address;
  }

  // Check weather risk table (if exists) or return mock data structure
  // In production, this would query actual weather data
  const weatherRisk = {
    address: jobAddress,
    date: date || new Date().toISOString().split("T")[0],
    risk_score: 0.3, // 0-1 scale
    risk_level: "low", // low, medium, high, severe
    conditions: {
      precipitation_probability: 0.1,
      wind_speed_mph: 8,
      temperature_f: 72,
      visibility_miles: 10,
    },
    recommendation: "Weather conditions are favorable for roofing work",
    alerts: [],
  };

  return NextResponse.json({ data: weatherRisk });
});




































