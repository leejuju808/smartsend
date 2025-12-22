// Block 89000 — Materials Dashboard Data
// GET /api/materials/dashboard
// Returns KPI cards data: orders this week, sent orders, deliveries scheduled, total costs, profitability forecast

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's teams
    const { data: teamMemberships } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id);

    if (!teamMemberships || teamMemberships.length === 0) {
      return NextResponse.json({
        ordersThisWeek: 0,
        ordersSent: 0,
        deliveriesScheduled: 0,
        totalMaterialCosts: 0,
        profitabilityForecast: 0,
        recentOrders: [],
        draftOrders: [],
      });
    }

    const teamIds = teamMemberships.map((tm) => tm.team_id);

    // Get jobs for these teams
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id")
      .in("team_id", teamIds);

    const jobIds = jobs?.map((j) => j.id) || [];

    if (jobIds.length === 0) {
      return NextResponse.json({
        ordersThisWeek: 0,
        ordersSent: 0,
        deliveriesScheduled: 0,
        totalMaterialCosts: 0,
        profitabilityForecast: 0,
        recentOrders: [],
        draftOrders: [],
      });
    }

    // Orders this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const { count: ordersThisWeek } = await supabase
      .from("material_orders")
      .select("*", { count: "exact", head: true })
      .in("job_id", jobIds)
      .gte("created_at", weekStart.toISOString());

    // Orders sent (status = 'sent' or 'confirmed')
    const { count: ordersSent } = await supabase
      .from("material_orders")
      .select("*", { count: "exact", head: true })
      .in("job_id", jobIds)
      .in("status", ["sent", "confirmed"]);

    // Deliveries scheduled (has delivery_date)
    const { count: deliveriesScheduled } = await supabase
      .from("material_orders")
      .select("*", { count: "exact", head: true })
      .in("job_id", jobIds)
      .not("delivery_date", "is", null)
      .in("status", ["sent", "confirmed"]);

    // Total material costs (sum of all orders)
    const { data: orders } = await supabase
      .from("material_orders")
      .select("total_cost")
      .in("job_id", jobIds)
      .not("total_cost", "is", null);

    const totalMaterialCosts =
      orders?.reduce((sum, o) => sum + (parseFloat(o.total_cost?.toString() || "0") || 0), 0) || 0;

    // Profitability forecast (sum of job contract values - material costs)
    const { data: jobsWithValue } = await supabase
      .from("jobs")
      .select("id, contract_value")
      .in("id", jobIds)
      .not("contract_value", "is", null);

    const totalRevenue =
      jobsWithValue?.reduce(
        (sum, j) => sum + (parseFloat(j.contract_value?.toString() || "0") || 0),
        0
      ) || 0;

    const profitabilityForecast = totalRevenue - totalMaterialCosts;

    // Recent orders (last 10)
    const { data: recentOrders } = await supabase
      .from("material_orders")
      .select(`
        id,
        status,
        delivery_date,
        total_cost,
        created_at,
        jobs!inner (
          id,
          lead_id,
          leads (
            first_name,
            last_name
          )
        ),
        suppliers (
          name
        )
      `)
      .in("job_id", jobIds)
      .order("created_at", { ascending: false })
      .limit(10);

    // Draft orders
    const { data: draftOrders } = await supabase
      .from("material_orders")
      .select(`
        id,
        status,
        delivery_date,
        created_at,
        jobs!inner (
          id,
          lead_id,
          leads (
            first_name,
            last_name
          )
        )
      `)
      .in("job_id", jobIds)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      ordersThisWeek: ordersThisWeek || 0,
      ordersSent: ordersSent || 0,
      deliveriesScheduled: deliveriesScheduled || 0,
      totalMaterialCosts,
      profitabilityForecast,
      recentOrders: recentOrders || [],
      draftOrders: draftOrders || [],
    });
  } catch (error) {
    console.error("Error in GET /api/materials/dashboard:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



























