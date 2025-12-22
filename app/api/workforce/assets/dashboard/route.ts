// GET /api/workforce/assets/dashboard - Get asset dashboard summary

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

    // Get summary using the helper function
    const { data: summary, error: summaryError } = await supabase.rpc(
      "get_asset_assignment_summary",
      { p_company_id: companyId }
    );

    if (summaryError) {
      console.error("Error fetching summary:", summaryError);
      // Fallback to manual calculation
      const [total, available, assigned, maintenance, lost] = await Promise.all([
        supabase
          .from("assets")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase
          .from("assets")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "available"),
        supabase
          .from("assets")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "assigned"),
        supabase
          .from("assets")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "maintenance"),
        supabase
          .from("assets")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "lost"),
      ]);

      const { data: damagedAssets } = await supabase
        .from("asset_damage_reports")
        .select("asset_id")
        .eq("resolved", false)
        .in(
          "asset_id",
          (
            await supabase
              .from("assets")
              .select("id")
              .eq("company_id", companyId)
          ).data?.map((a) => a.id) || []
        );

      const { data: overdueMaintenance } = await supabase
        .from("asset_maintenance")
        .select("asset_id")
        .lt("next_due", new Date().toISOString().split("T")[0])
        .in(
          "asset_id",
          (
            await supabase
              .from("assets")
              .select("id")
              .eq("company_id", companyId)
          ).data?.map((a) => a.id) || []
        );

      return NextResponse.json({
        summary: {
          total_assets: total.count || 0,
          available: available.count || 0,
          assigned: assigned.count || 0,
          in_maintenance: maintenance.count || 0,
          lost: lost.count || 0,
          damaged_open_reports:
            new Set(damagedAssets?.map((d) => d.asset_id)).size || 0,
          overdue_maintenance:
            new Set(overdueMaintenance?.map((m) => m.asset_id)).size || 0,
        },
      });
    }

    // Get lost assets
    const { data: lostAssets } = await supabase.rpc("get_lost_assets", {
      p_company_id: companyId,
    });

    // Get assets due for maintenance
    const { data: maintenanceDue } = await supabase.rpc(
      "get_assets_due_for_maintenance",
      { p_company_id: companyId, p_days_ahead: 7 }
    );

    // Get recent damage reports
    const { data: recentDamageReports } = await supabase
      .from("asset_damage_reports")
      .select(`
        *,
        asset:assets(name, category),
        employee:workforce_employees(first_name, last_name),
        job:jobs(id, stage)
      `)
      .eq("resolved", false)
      .in(
        "asset_id",
        (
          await supabase
            .from("assets")
            .select("id")
            .eq("company_id", companyId)
        ).data?.map((a) => a.id) || []
      )
      .order("reported_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      summary: summary || {},
      lost_assets: lostAssets || [],
      maintenance_due: maintenanceDue || [],
      recent_damage_reports: recentDamageReports || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/assets/dashboard:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























