// GET /api/workforce/employees/[id]/issue-stats
// Get issue statistics for an employee

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const employeeId = params.id;

    // Get issue stats from view
    const { data, error } = await supabase
      .from("employee_issue_stats")
      .select("*")
      .eq("employee_id", employeeId)
      .single();

    if (error) {
      // If no stats found, return zeros
      if (error.code === "PGRST116") {
        return NextResponse.json({
          total_issues: 0,
          severe_issues: 0,
          critical_issues: 0,
          high_issues: 0,
          medium_issues: 0,
          low_issues: 0,
          last_issue_reported_at: null,
        });
      }
      console.error("Error fetching issue stats:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || {
      total_issues: 0,
      severe_issues: 0,
      critical_issues: 0,
      high_issues: 0,
      medium_issues: 0,
      low_issues: 0,
      last_issue_reported_at: null,
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/employees/[id]/issue-stats:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























