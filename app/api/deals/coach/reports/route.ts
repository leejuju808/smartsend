import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * GET /api/deals/coach/reports
 * Get daily AI Deal Coach reports for the workspace
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const url = new URL(req.url);
  const date = url.searchParams.get("date"); // Optional: YYYY-MM-DD format
  const brandId = url.searchParams.get("brand_id");

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Build query
  let query = supabase
    .from("deal_coach_reports")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("report_date", { ascending: false })
    .limit(30); // Last 30 days

  if (date) {
    query = query.eq("report_date", date);
  }

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data: reports, error: reportsError } = await query;

  if (reportsError) {
    return NextResponse.json(
      { error: reportsError.message },
      { status: 400 }
    );
  }

  // If no report for today, return empty with flag
  const today = new Date().toISOString().split("T")[0];
  const todayReport = reports?.find((r) => r.report_date === today);

  if (!todayReport && !date) {
    return NextResponse.json({
      reports: reports || [],
      today_report: null,
      needs_generation: true,
      message: "Today's report is being generated. Check back in a few minutes.",
    });
  }

  return NextResponse.json({
    reports: reports || [],
    today_report: todayReport || null,
  });
}

/**
 * POST /api/deals/coach/reports
 * Trigger manual generation of daily report
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => ({}));
  const { brand_id } = body;

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Trigger report generation via edge function
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-deal-coach`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        brand_id: brand_id || null,
        trigger: "daily_report",
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: result.error || "Report generation failed" },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      report: result.report,
      message: "Report generated successfully",
    });
  } catch (error: any) {
    console.error("Error generating report:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate report" },
      { status: 500 }
    );
  }
}



