// app/api/dashboard/conversion/route.ts
// Block 10200 — SmartSend Conversion Dashboard API
// Returns conversion metrics for the money screen

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Fetch dashboard metrics
    const { data: metrics, error: metricsError } = await supabase
      .from("dashboard_metrics")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    // If metrics don't exist, calculate them
    if (!metrics || metricsError) {
      // Call the edge function to calculate metrics
      const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/dashboard-calc`;
      const calcResponse = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          user_id: user.id,
        }),
      });

      if (!calcResponse.ok) {
        const errorText = await calcResponse.text();
        console.error("Error calculating metrics:", errorText);
        // Return default values if calculation fails
        return NextResponse.json({
          emails_sent: 0,
          replies_received: 0,
          leads_identified: 0,
          hot_leads: 0,
          warm_leads: 0,
          cold_leads: 0,
          est_job_value: 0,
          last_updated: new Date().toISOString(),
        });
      }

      const { metrics: calculatedMetrics } = await calcResponse.json();
      return NextResponse.json(calculatedMetrics);
    }

    return NextResponse.json(metrics);
  } catch (error) {
    console.error("Conversion dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to load conversion dashboard data" },
      { status: 500 }
    );
  }
}

// POST endpoint to trigger calculation
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Call the edge function to calculate metrics
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/dashboard-calc`;
    const calcResponse = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        user_id: user.id,
      }),
    });

    if (!calcResponse.ok) {
      const errorText = await calcResponse.text();
      return NextResponse.json(
        { error: errorText },
        { status: calcResponse.status }
      );
    }

    const { metrics } = await calcResponse.json();
    return NextResponse.json({ success: true, metrics });
  } catch (error) {
    console.error("Conversion dashboard calculation error:", error);
    return NextResponse.json(
      { error: "Failed to calculate metrics" },
      { status: 500 }
    );
  }
}























































