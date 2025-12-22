// GET /api/workforce/issues/job-risk/[jobId]
// Get risk score for a job based on issues

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const jobId = params.jobId;

    // Calculate risk score using database function
    const { data: riskScore, error: scoreError } = await supabase.rpc(
      "calculate_job_risk_score",
      { p_job_id: jobId }
    );

    if (scoreError) {
      console.error("Error calculating risk score:", scoreError);
      return NextResponse.json({ error: scoreError.message }, { status: 500 });
    }

    // Get risk level label
    const { data: riskLevel, error: levelError } = await supabase.rpc(
      "get_job_risk_level",
      { p_score: riskScore || 0 }
    );

    if (levelError) {
      console.error("Error getting risk level:", levelError);
    }

    // Get issue counts by severity
    const { data: issues, error: issuesError } = await supabase
      .from("crew_issues")
      .select("severity")
      .eq("job_id", jobId)
      .in("status", ["open", "in_progress"]);

    if (issuesError) {
      console.error("Error fetching issues:", issuesError);
    }

    const issueCounts = {
      critical: issues?.filter((i) => i.severity === "critical").length || 0,
      high: issues?.filter((i) => i.severity === "high").length || 0,
      medium: issues?.filter((i) => i.severity === "medium").length || 0,
      low: issues?.filter((i) => i.severity === "low").length || 0,
    };

    return NextResponse.json({
      score: riskScore || 0,
      level: riskLevel || "NONE",
      issue_counts: issueCounts,
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/issues/job-risk/[jobId]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























