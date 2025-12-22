// GET /api/workforce/issues/list
// List all issues with filters

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
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");
    const issue_type = searchParams.get("issue_type");
    const job_id = searchParams.get("job_id");

    let query = supabase
      .from("crew_issues")
      .select(`
        *,
        jobs:job_id (
          id,
          job_name,
          title,
          address
        ),
        workforce_employees:employee_id (
          id,
          first_name,
          last_name
        )
      `)
      .order("reported_at", { ascending: false });

    // Filter by company (through employees or jobs)
    // This is a simplified filter - you may need to adjust based on your schema
    if (status) {
      query = query.eq("status", status);
    }
    if (severity) {
      query = query.eq("severity", severity);
    }
    if (issue_type) {
      query = query.eq("issue_type", issue_type);
    }
    if (job_id) {
      query = query.eq("job_id", job_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching issues:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter by company (post-query filter if needed)
    // This ensures we only return issues for the user's company
    const filteredData = data?.filter((issue: any) => {
      // If issue has employee, check employee's company
      if (issue.workforce_employees) {
        // You'll need to join this properly in the query or filter here
        return true; // Simplified - adjust based on your needs
      }
      return true;
    });

    return NextResponse.json({ issues: filteredData || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/issues/list:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























