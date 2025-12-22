// Block 64000 — Production Timeline Optimizer
// POST /api/timeline/weather-adjust
// Adjusts timeline based on weather conditions

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, weather_delay_hours, weather_risk_level, weather_adjusted_end } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Verify access
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("workspace_id, address")
      .eq("id", job_id)
      .single();

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get or create timeline
    const { data: existingTimeline } = await supabase
      .from("production_timeline")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const updateData: any = {
      weather_delay_hours: weather_delay_hours || 0,
      weather_risk_level: weather_risk_level || "none",
      updated_at: new Date().toISOString()
    };

    if (weather_adjusted_end) {
      updateData.weather_adjusted_end = weather_adjusted_end;
    }

    let timeline;
    if (existingTimeline) {
      const { data: updated, error: updateError } = await supabase
        .from("production_timeline")
        .update(updateData)
        .eq("id", existingTimeline.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating timeline:", updateError);
        return NextResponse.json(
          { error: "Failed to update timeline", details: updateError.message },
          { status: 500 }
        );
      }
      timeline = updated;
    } else {
      const { data: created, error: createError } = await supabase
        .from("production_timeline")
        .insert({
          job_id,
          workspace_id: job.workspace_id,
          ...updateData
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating timeline:", createError);
        return NextResponse.json(
          { error: "Failed to create timeline", details: createError.message },
          { status: 500 }
        );
      }
      timeline = created;
    }

    // Create weather alert if significant delay
    if (weather_delay_hours && weather_delay_hours > 2) {
      const alertSeverity = weather_delay_hours > 8 ? "critical" : weather_delay_hours > 4 ? "warning" : "info";
      
      await supabase
        .from("delay_alerts")
        .insert({
          job_id,
          workspace_id: job.workspace_id,
          alert_type: "weather_impact",
          message: `Weather is causing a ${weather_delay_hours.toFixed(1)} hour delay`,
          severity: alertSeverity,
          delay_hours: weather_delay_hours,
          metadata: {
            weather_risk_level: weather_risk_level,
            weather_adjusted_end: weather_adjusted_end
          }
        });
    }

    return NextResponse.json({
      success: true,
      timeline,
      weather_adjusted: true
    });
  } catch (error: any) {
    console.error("Error in /api/timeline/weather-adjust:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// GET /api/timeline/weather-adjust?job_id=xxx
// Get weather adjustments for a job
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const job_id = searchParams.get("job_id");

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get timeline with weather data
    const { data: timeline, error } = await supabase
      .from("production_timeline")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("Error fetching timeline:", error);
      return NextResponse.json(
        { error: "Failed to fetch timeline", details: error.message },
        { status: 500 }
      );
    }

    // Get weather alerts
    const { data: weatherAlerts } = await supabase
      .from("delay_alerts")
      .select("*")
      .eq("job_id", job_id)
      .eq("alert_type", "weather_impact")
      .eq("resolved", false)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      success: true,
      timeline: timeline || null,
      weather_alerts: weatherAlerts || []
    });
  } catch (error: any) {
    console.error("Error in GET /api/timeline/weather-adjust:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}




























