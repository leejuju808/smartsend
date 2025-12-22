// app/api/hot-leads/analytics/route.ts
// Block 97000 — Hot Lead Performance Analytics API
// Returns response time statistics and performance metrics

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
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

  // Get workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  const workspaceId = membership?.workspace_id;

  const { searchParams } = new URL(req.url);
  const daysParam = searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) || 30 : 30;

  try {
    // Get average response time for this user
    const { data: avgResponse, error: avgError } = await supabase
      .rpc("get_avg_response_time", {
        p_user_id: user.id,
        p_days: days,
      });

    // Get response time stats
    const { data: responseTimes, error: timesError } = await supabase
      .from("lead_response_times")
      .select("seconds, heat_score, created_at")
      .eq("user_id", user.id)
      .eq("heat_score", "hot")
      .gte("created_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false });

    if (timesError) {
      console.error("Error fetching response times:", timesError);
    }

    // Calculate statistics
    const times = (responseTimes || []).map((r: any) => r.seconds);
    const avgSeconds = times.length > 0 
      ? Math.round(times.reduce((a: number, b: number) => a + b, 0) / times.length)
      : 0;
    const minSeconds = times.length > 0 ? Math.min(...times) : 0;
    const maxSeconds = times.length > 0 ? Math.max(...times) : 0;

    // Count responses under 1 minute (60 seconds)
    const underOneMinute = times.filter((t: number) => t < 60).length;

    // Get hot leads count
    const hotLeadsCount = workspaceId
      ? await supabase.rpc("get_hot_leads_count", { p_workspace_id: workspaceId })
      : { data: 0, error: null };

    return NextResponse.json({
      average_response_time_seconds: avgSeconds || avgResponse || 0,
      average_response_time_minutes: Math.round((avgSeconds || avgResponse || 0) / 60),
      min_response_time_seconds: minSeconds,
      max_response_time_seconds: maxSeconds,
      total_responses: times.length,
      responses_under_one_minute: underOneMinute,
      hot_leads_count: hotLeadsCount.data || 0,
      period_days: days,
    });
  } catch (error: any) {
    console.error("Analytics error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}


























