// Block 80000 — SmartSend Roofing
// "Job Value Predictor + Profit Probability AI" v1
// API Route: Get Leads with Predictions

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = req.nextUrl.searchParams;
    const workspaceId = searchParams.get("workspace_id");
    const sortBy = searchParams.get("sort_by") || "high-profit";
    const limit = parseInt(searchParams.get("limit") || "50");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required field: workspace_id" },
        { status: 400 }
      );
    }

    // Build query based on sort_by
    let query = supabase
      .from("lead_value_predictions")
      .select(`
        *,
        leads (
          id,
          email,
          first_name,
          last_name,
          status
        )
      `)
      .eq("workspace_id", workspaceId)
      .limit(limit);

    // Apply sorting
    switch (sortBy) {
      case "high-profit":
        query = query.order("profit_score", { ascending: false });
        break;
      case "high-value":
        query = query.order("predicted_job_value", { ascending: false });
        break;
      case "high-close":
        query = query.order("close_probability", { ascending: false });
        break;
      default:
        query = query.order("profit_score", { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching predictions:", error);
      return NextResponse.json(
        { error: "Failed to fetch predictions" },
        { status: 500 }
      );
    }

    // Transform data to include lead info
    const leads = (data || []).map((pred: any) => ({
      id: pred.leads?.id || pred.lead_id,
      email: pred.leads?.email || "",
      first_name: pred.leads?.first_name || null,
      last_name: pred.leads?.last_name || null,
      status: pred.leads?.status || null,
      prediction: {
        predicted_job_value: pred.predicted_job_value,
        predicted_job_value_min: pred.predicted_job_value_min,
        predicted_job_value_max: pred.predicted_job_value_max,
        close_probability: pred.close_probability,
        profit_score: pred.profit_score,
        recommended_priority: pred.recommended_priority,
        reasoning: pred.reasoning,
      },
    }));

    return NextResponse.json({ leads });
  } catch (error: any) {
    console.error("Error in predictions route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























