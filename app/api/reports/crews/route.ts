import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

/**
 * GET /api/reports/crews
 * Get crew performance report
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const company_id = searchParams.get("company_id");
    const period = searchParams.get("period") || "monthly";
    const period_start = searchParams.get("period_start");
    const period_end = searchParams.get("period_end");

    if (!workspace_id) {
      return NextResponse.json({ error: "Missing workspace_id" }, { status: 400 });
    }

    // Verify workspace membership
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build query
    let query = supabase
      .from("report_crews")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("period", period)
      .order("performance_score", { ascending: false });

    if (company_id) {
      query = query.eq("roofing_company_id", company_id);
    }

    if (period_start) {
      query = query.gte("period_start", period_start);
    }

    if (period_end) {
      query = query.lte("period_end", period_end);
    }

    const { data: reports, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate summary stats
    const summary = {
      total_crews: reports?.length || 0,
      total_jobs_completed: reports?.reduce((sum, r) => sum + (r.jobs_completed || 0), 0) || 0,
      avg_efficiency: reports && reports.length > 0
        ? reports.reduce((sum, r) => sum + (Number(r.efficiency_score) || 0), 0) / reports.length
        : 0,
      avg_quality: reports && reports.length > 0
        ? reports.reduce((sum, r) => sum + (Number(r.quality_score) || 0), 0) / reports.length
        : 0,
      avg_safety: reports && reports.length > 0
        ? reports.reduce((sum, r) => sum + (Number(r.safety_score) || 0), 0) / reports.length
        : 0,
      total_rework: reports?.reduce((sum, r) => sum + (r.rework_count || 0), 0) || 0,
      total_issues: reports?.reduce((sum, r) => sum + (r.issues_reported || 0), 0) || 0,
    };

    return NextResponse.json({
      reports: reports || [],
      summary,
    });
  } catch (error: any) {
    console.error("Error fetching crew report:", error);
    return NextResponse.json(
      { error: "Failed to fetch crew report", details: error.message },
      { status: 500 }
    );
  }
}

























