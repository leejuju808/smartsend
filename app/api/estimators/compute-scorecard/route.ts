// Block 21746 — SmartSend Roofing Estimator Scorecard v1
// API route to trigger scorecard computation

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
    const { estimator_id, workspace_id, period_start, period_end } = body;

    if (!estimator_id || !workspace_id || !period_start || !period_end) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: estimator_id, workspace_id, period_start, period_end",
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

    // Call edge function to compute scorecard
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/compute-estimator-scorecard`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          estimator_id,
          workspace_id,
          period_start,
          period_end,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Error calling edge function:", error);
      return NextResponse.json(
        { error: error || "Failed to compute scorecard" },
        { status: response.status }
      );
    }

    const scorecard = await response.json();

    return NextResponse.json({ scorecard });
  } catch (error: any) {
    console.error("Error in /api/estimators/compute-scorecard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}









































