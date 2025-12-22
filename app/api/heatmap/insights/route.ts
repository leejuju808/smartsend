// Block 24580 — SmartSend Roofing Neighborhood Heatmap v1
// API Route: Get Heatmap Insights
// GET /api/heatmap/insights?workspace_id=xxx

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
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

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Generate insights
    await supabase.rpc("generate_heatmap_insights", {
      p_workspace_id: workspace_id,
    });

    // Fetch insights
    const { data: insights, error: insightsError } = await supabase
      .from("heatmap_insights")
      .select("*")
      .eq("workspace_id", workspace_id)
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("priority", { ascending: false })
      .limit(20);

    if (insightsError) {
      console.error("Insights error:", insightsError);
      return NextResponse.json(
        { error: "Failed to fetch insights" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      insights: (insights || []).map((insight) => ({
        id: insight.id,
        zip: insight.zip,
        neighborhood_name: insight.neighborhood_name,
        insight_type: insight.insight_type,
        insight_text: insight.insight_text,
        insight_color: insight.insight_color,
        priority: insight.priority,
        suggested_action: insight.suggested_action,
        action_type: insight.action_type,
        generated_at: insight.generated_at,
      })),
      count: insights?.length || 0,
    });
  } catch (err: any) {
    console.error("Heatmap insights error:", err);
    return NextResponse.json(
      {
        error: "Failed to fetch insights",
        details: err.message,
      },
      { status: 500 }
    );
  }
}






































