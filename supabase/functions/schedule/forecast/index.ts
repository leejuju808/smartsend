// Block 60000 — SmartSend Roofing "AI Scheduling Assistant + Predictive Workload Planner" v1
// Edge Function: /schedule/forecast
// 
// Generates weekly/monthly workload forecasts
// Shows: hours needed vs available, shortages, overloads

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ForecastRequest {
  workspace_id: string;
  week_start?: string; // YYYY-MM-DD (Monday), defaults to this week
  forecast_type?: "weekly" | "monthly";
  weeks_ahead?: number; // How many weeks to forecast (default: 4)
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: ForecastRequest = await req.json();

    if (!body.workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate week start (Monday)
    let weekStart: Date;
    if (body.week_start) {
      weekStart = new Date(body.week_start);
    } else {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      weekStart = new Date(today);
      weekStart.setDate(today.getDate() - daysToMonday);
    }

    const weeksAhead = body.weeks_ahead || 4;
    const forecastType = body.forecast_type || "weekly";

    // ============================================================
    // Get all active crews
    // ============================================================
    const { data: crews, error: crewsError } = await supabase
      .from("crews")
      .select("id, name, daily_capacity_squares, is_active")
      .eq("workspace_id", body.workspace_id)
      .eq("is_active", true);

    if (crewsError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch crews" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const forecasts: any[] = [];

    // ============================================================
    // Generate forecast for each week
    // ============================================================
    for (let weekOffset = 0; weekOffset < weeksAhead; weekOffset++) {
      const currentWeekStart = new Date(weekStart);
      currentWeekStart.setDate(weekStart.getDate() + weekOffset * 7);
      const currentWeekEnd = new Date(currentWeekStart);
      currentWeekEnd.setDate(currentWeekStart.getDate() + 6);

      const weekStartStr = currentWeekStart.toISOString().split("T")[0];
      const weekEndStr = currentWeekEnd.toISOString().split("T")[0];

      // Calculate forecast using database function
      const { data: forecastData, error: forecastError } = await supabase.rpc(
        "calculate_weekly_forecast",
        {
          p_workspace_id: body.workspace_id,
          p_week_start: weekStartStr,
        }
      );

      if (forecastError) {
        console.error("Error calculating forecast:", forecastError);
        continue;
      }

      const forecast = forecastData?.[0];

      // Get detailed crew breakdown
      const crewBreakdown: any = {};

      for (const crew of crews || []) {
        // Get scheduled hours for this crew this week
        const { data: crewSchedules } = await supabase
          .from("crew_schedules")
          .select("estimated_duration, start_date, end_date")
          .eq("crew_id", crew.id)
          .eq("status", "scheduled")
          .gte("start_date", weekStartStr)
          .lte("start_date", weekEndStr);

        const hoursRequired = crewSchedules?.reduce(
          (sum, s) => sum + (s.estimated_duration || 0),
          0
        ) || 0;

        // Calculate hours available (8 hours/day * 5 days/week)
        const hoursAvailable = 8 * 5; // 40 hours/week per crew

        crewBreakdown[crew.id] = {
          crew_id: crew.id,
          crew_name: crew.name,
          hours_required: hoursRequired,
          hours_available: hoursAvailable,
          shortage: Math.max(hoursRequired - hoursAvailable, 0),
          utilization_percentage: (hoursRequired / hoursAvailable) * 100,
        };
      }

      // Get pending jobs count
      const { count: pendingJobsCount } = await supabase
        .from("roofing_jobs")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", body.workspace_id)
        .eq("status", "unscheduled");

      // Calculate total hours available (all crews combined)
      const totalHoursAvailable = (crews?.length || 0) * 40; // 40 hours/week per crew
      const totalHoursRequired = forecast?.total_hours_required || 0;
      const shortage = Math.max(totalHoursRequired - totalHoursAvailable, 0);
      const surplus = Math.max(totalHoursAvailable - totalHoursRequired, 0);

      // Determine forecast status
      let status = "healthy";
      if (shortage > 0) {
        const shortagePercentage = (shortage / totalHoursAvailable) * 100;
        if (shortagePercentage > 20) {
          status = "critical";
        } else if (shortagePercentage > 10) {
          status = "warning";
        } else {
          status = "caution";
        }
      }

      // Save or update forecast in database
      const forecastRecord = {
        workspace_id: body.workspace_id,
        week_start: weekStartStr,
        week_end: weekEndStr,
        total_hours_required: totalHoursRequired,
        total_hours_available: totalHoursAvailable,
        jobs_scheduled: forecast?.jobs_scheduled || 0,
        jobs_pending: pendingJobsCount || 0,
        crew_breakdown: crewBreakdown,
        forecast_type: forecastType,
      };

      const { data: savedForecast, error: saveError } = await supabase
        .from("scheduling_forecasts")
        .upsert(
          {
            ...forecastRecord,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "workspace_id,week_start,forecast_type",
          }
        )
        .select()
        .single();

      if (saveError) {
        console.error("Error saving forecast:", saveError);
      }

      forecasts.push({
        week_start: weekStartStr,
        week_end: weekEndStr,
        total_hours_required: totalHoursRequired,
        total_hours_available: totalHoursAvailable,
        shortage: shortage,
        surplus: surplus,
        utilization_percentage: (totalHoursRequired / totalHoursAvailable) * 100,
        jobs_scheduled: forecast?.jobs_scheduled || 0,
        jobs_pending: pendingJobsCount || 0,
        status: status,
        crew_breakdown: crewBreakdown,
        recommendations: generateRecommendations(shortage, totalHoursAvailable, pendingJobsCount || 0),
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        workspace_id: body.workspace_id,
        forecast_type: forecastType,
        forecasts: forecasts,
        summary: {
          total_weeks: forecasts.length,
          weeks_with_shortage: forecasts.filter((f) => f.shortage > 0).length,
          weeks_critical: forecasts.filter((f) => f.status === "critical").length,
          average_utilization: forecasts.reduce((sum, f) => sum + f.utilization_percentage, 0) / forecasts.length,
          total_pending_jobs: forecasts[0]?.jobs_pending || 0,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating forecast:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateRecommendations(
  shortage: number,
  totalHoursAvailable: number,
  pendingJobs: number
): string[] {
  const recommendations: string[] = [];

  if (shortage > 0) {
    const shortagePercentage = (shortage / totalHoursAvailable) * 100;

    if (shortagePercentage > 20) {
      recommendations.push("CRITICAL: Consider hiring additional crew or subcontracting");
      recommendations.push("Delay non-urgent jobs to next week");
    } else if (shortagePercentage > 10) {
      recommendations.push("Consider scheduling overtime or bringing in temporary help");
      recommendations.push("Review job priorities and reschedule if possible");
    } else {
      recommendations.push("Monitor workload closely - approaching capacity");
    }
  } else {
    const utilization = ((totalHoursAvailable - shortage) / totalHoursAvailable) * 100;
    if (utilization < 70) {
      recommendations.push("Underutilized capacity - consider accelerating job scheduling");
      if (pendingJobs > 0) {
        recommendations.push(`${pendingJobs} pending jobs available to schedule`);
      }
    }
  }

  if (pendingJobs > 5) {
    recommendations.push(`High number of pending jobs (${pendingJobs}) - prioritize scheduling`);
  }

  return recommendations;
}
































