import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * GET /api/revenue/roofing-dashboard
 * Block 20650: Returns roofing revenue dashboard data
 * Shows pipeline value, approved claims, install-ready revenue, supplements, KPIs, and charts
 */
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  try {
    // Call the database function to get dashboard data
    const { data: dashboardData, error } = await supabase.rpc(
      'get_roofing_revenue_dashboard',
      { p_workspace_id: workspaceId }
    );

    if (error) {
      console.error("Error fetching roofing revenue dashboard:", error);
      throw error;
    }

    return NextResponse.json({
      ok: true,
      data: dashboardData,
      calculatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Roofing revenue dashboard error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load roofing revenue dashboard" },
      { status: 500 }
    );
  }
}
















































