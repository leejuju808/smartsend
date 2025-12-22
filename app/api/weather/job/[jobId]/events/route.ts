// Block 252700 — Real-Time Weather Intelligence Engine
// GET /api/weather/job/[jobId]/events
// Returns weather events for a job

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
    const { searchParams } = req.nextUrl;
    const limit = parseInt(searchParams.get("limit") || "20");

    // Fetch recent weather events
    const { data: events, error } = await supabase
      .from("weather_events")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching weather events:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ events: events || [] });
  } catch (error: any) {
    console.error("Error in weather events API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























