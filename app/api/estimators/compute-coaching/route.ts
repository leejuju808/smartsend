// Block 21812 — SmartSend Roofing Estimator Coaching Engine v1
// API route to trigger coaching report computation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { estimator_id, workspace_id, week_start, week_end, report_type = "weekly" } = body;

    if (!workspace_id || !report_type) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: workspace_id, report_type",
        },
        { status: 400 }
      );
    }

    if (report_type !== "daily" && report_type !== "weekly") {
      return NextResponse.json(
        {
          error: "report_type must be 'daily' or 'weekly'",
        },
        { status: 400 }
      );
    }

    // Verify user is a member of this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this workspace" },
        { status: 403 }
      );
    }

    // Call edge function to compute coaching report
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/generate-estimator-coaching`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          estimator_id, // Optional: if not provided, generates for all estimators
          workspace_id,
          report_type,
          period_start: week_start,
          period_end: week_end,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Error calling edge function:", error);
      return NextResponse.json(
        { error: error || "Failed to compute coaching report" },
        { status: response.status }
      );
    }

    const coachingReport = await response.json();

    return NextResponse.json({ coachingReport });
  } catch (error: any) {
    console.error("Error in /api/estimators/compute-coaching:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

