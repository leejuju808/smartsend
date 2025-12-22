// Block 25340 — SmartSend Roofing Job Costing & Profit Engine v1
// API Route: Owner-Only Profit Dashboard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30");

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id
    const { data: membership, error: memError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memError || !membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspaceId = membership.workspace_id;

    // Check if user is owner
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", workspaceId)
      .single();

    if (!workspace || workspace.owner_id !== user.id) {
      // Check if user has owner role
      const { data: userRole } = await supabase
        .from("users")
        .select("role")
        .eq("auth_user_id", user.id)
        .single();

      if (userRole?.role !== "owner") {
        return NextResponse.json({ error: "Owner access required" }, { status: 403 });
      }
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Top 10 Most Profitable Jobs
    const { data: topProfitable, error: topError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        job_value,
        revenue_collected,
        actual_total_cost,
        actual_gross_profit,
        actual_margin_pct,
        profit_status,
        job_revenue_type,
        scheduled_start_date
      `)
      .eq("workspace_id", workspaceId)
      .not("actual_gross_profit", "is", null)
      .gte("scheduled_start_date", cutoffDate.toISOString().split("T")[0])
      .order("actual_gross_profit", { ascending: false })
      .limit(10);

    // Top 10 Least Profitable Jobs
    const { data: leastProfitable, error: leastError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        job_value,
        revenue_collected,
        actual_total_cost,
        actual_gross_profit,
        actual_margin_pct,
        profit_status,
        job_revenue_type,
        scheduled_start_date
      `)
      .eq("workspace_id", workspaceId)
      .not("actual_gross_profit", "is", null)
      .gte("scheduled_start_date", cutoffDate.toISOString().split("T")[0])
      .order("actual_gross_profit", { ascending: true })
      .limit(10);

    // Crew Cost Efficiency
    const { data: crewEfficiency, error: crewError } = await supabase
      .rpc("get_crew_efficiency", { p_workspace_id: workspaceId, p_days: days });

    // Supplier Cost Accuracy
    const { data: supplierAccuracy, error: supplierError } = await supabase
      .from("material_orders")
      .select(`
        supplier_id,
        suppliers!inner(name),
        actual_invoice_variance_pct
      `)
      .eq("workspace_id", workspaceId)
      .not("actual_invoice_variance_pct", "is", null)
      .gte("created_at", cutoffDate.toISOString());

    // Insurance vs Retail ROI
    const { data: insuranceVsRetail, error: ivrError } = await supabase
      .from("insurance_vs_retail_profit_comparison")
      .select("*")
      .eq("workspace_id", workspaceId);

    // Average Margin (30 days)
    const { data: avgMargin, error: avgError } = await supabase
      .from("roofing_jobs")
      .select("actual_margin_pct")
      .eq("workspace_id", workspaceId)
      .not("actual_margin_pct", "is", null)
      .gte("scheduled_start_date", cutoffDate.toISOString().split("T")[0]);

    // Projected Revenue vs Actual Revenue
    const { data: revenueComparison, error: revError } = await supabase
      .from("roofing_jobs")
      .select("job_value, revenue_collected")
      .eq("workspace_id", workspaceId)
      .not("job_value", "is", null)
      .not("revenue_collected", "is", null)
      .gte("scheduled_start_date", cutoffDate.toISOString().split("T")[0]);

    // Process supplier accuracy
    const supplierMap = new Map();
    if (supplierAccuracy) {
      supplierAccuracy.forEach((order: any) => {
        const supplierName = order.suppliers?.name || "Unknown";
        if (!supplierMap.has(supplierName)) {
          supplierMap.set(supplierName, {
            name: supplierName,
            variance_pcts: [],
            avg_variance: 0,
          });
        }
        if (order.actual_invoice_variance_pct !== null) {
          supplierMap.get(supplierName).variance_pcts.push(order.actual_invoice_variance_pct);
        }
      });
      supplierMap.forEach((supplier: any) => {
        if (supplier.variance_pcts.length > 0) {
          supplier.avg_variance =
            supplier.variance_pcts.reduce((a: number, b: number) => a + b, 0) /
            supplier.variance_pcts.length;
        }
      });
    }

    const avgMarginValue =
      avgMargin && avgMargin.length > 0
        ? avgMargin.reduce((sum: number, job: any) => sum + (job.actual_margin_pct || 0), 0) /
          avgMargin.length
        : 0;

    const projectedRevenue =
      revenueComparison?.reduce((sum: number, job: any) => sum + (job.job_value || 0), 0) || 0;
    const actualRevenue =
      revenueComparison?.reduce((sum: number, job: any) => sum + (job.revenue_collected || 0), 0) ||
      0;

    return NextResponse.json({
      top_profitable_jobs: topProfitable || [],
      least_profitable_jobs: leastProfitable || [],
      crew_efficiency: crewEfficiency || [],
      supplier_cost_accuracy: Array.from(supplierMap.values()),
      insurance_vs_retail: insuranceVsRetail || [],
      average_margin: avgMarginValue,
      projected_revenue: projectedRevenue,
      actual_revenue: actualRevenue,
      revenue_variance: actualRevenue - projectedRevenue,
      revenue_variance_pct:
        projectedRevenue > 0 ? ((actualRevenue - projectedRevenue) / projectedRevenue) * 100 : 0,
    });
  } catch (error: any) {
    console.error("Profit dashboard error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































