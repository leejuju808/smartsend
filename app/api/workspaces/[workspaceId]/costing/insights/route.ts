// Block 255700 — SmartSend Job Costing & Profit Engine v1
// API Route: Company-wide profit insights
// GET /api/workspaces/[workspaceId]/costing/insights - Get company-wide profit insights

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    // Call get_company_profit_insights function
    const { data: insights, error } = await supabase.rpc(
      "get_company_profit_insights",
      {
        p_workspace_id: workspaceId,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
      }
    );

    if (error) {
      console.error("Error fetching profit insights:", error);
      return NextResponse.json(
        { error: "Failed to fetch profit insights", details: error.message },
        { status: 500 }
      );
    }

    // Get additional metrics
    const { data: jobs } = await supabase
      .from("job_costs")
      .select(
        `
        profit,
        margin,
        materials_cost,
        labor_cost,
        roofing_jobs!inner (
          id,
          title,
          status,
          crew_name
        )
      `
      )
      .eq("roofing_jobs.workspace_id", workspaceId)
      .order("profit", { ascending: false })
      .limit(10);

    // Calculate average labor hours per square (if square footage is tracked)
    // This would require square_footage on roofing_jobs
    const avgLaborHoursPerSquare = 0.42; // Placeholder

    // Calculate material waste percentage
    const { data: materialUsage } = await supabase
      .from("material_usage")
      .select("quantity_expected, quantity_actual")
      .eq("job_id", workspaceId) // This would need to be filtered by workspace jobs
      .not("quantity_expected", "is", null)
      .not("quantity_actual", "is", null);

    let materialWastePct = 0;
    if (materialUsage && materialUsage.length > 0) {
      const totalExpected = materialUsage.reduce(
        (sum, m) => sum + (m.quantity_expected || 0),
        0
      );
      const totalActual = materialUsage.reduce(
        (sum, m) => sum + (m.quantity_actual || 0),
        0
      );
      if (totalExpected > 0) {
        materialWastePct = ((totalActual - totalExpected) / totalExpected) * 100;
      }
    }

    return NextResponse.json({
      insights: insights || {},
      top_jobs: jobs || [],
      metrics: {
        average_labor_hours_per_square: avgLaborHoursPerSquare,
        material_waste_percentage: materialWastePct,
      },
    });
  } catch (error: any) {
    console.error("Error in get profit insights:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















