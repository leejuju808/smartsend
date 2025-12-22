// GET /api/fleet/analytics - Get fleet expense analytics

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const startDate = searchParams.get("start_date") || new Date(new Date().setDate(1)).toISOString().split("T")[0];
    const endDate = searchParams.get("end_date") || new Date().toISOString().split("T")[0];

    // Use the database function for analytics
    const { data, error } = await supabase.rpc("get_fleet_expense_analytics", {
      p_company_id: companyId,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      console.error("Error fetching fleet analytics:", error);
      // Fallback to manual calculation if function doesn't exist
      return NextResponse.json({ analytics: [], total_fuel: 0, total_miles: 0 });
    }

    // Calculate totals
    const totalFuel = data?.reduce((sum: number, v: any) => sum + Number(v.fuel_total || 0), 0) || 0;
    const totalMiles = data?.reduce((sum: number, v: any) => sum + Number(v.miles_driven || 0), 0) || 0;
    const totalCost = data?.reduce((sum: number, v: any) => sum + Number(v.total_cost || 0), 0) || 0;

    return NextResponse.json({
      analytics: data || [],
      totals: {
        fuel_total: totalFuel,
        maintenance_total: 0, // TODO: Add when maintenance costs table exists
        repair_total: 0, // TODO: Add when repair costs table exists
        total_cost: totalCost,
        total_miles: totalMiles,
        avg_cost_per_mile: totalMiles > 0 ? totalCost / totalMiles : 0,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/fleet/analytics:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























