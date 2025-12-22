// GET /v1/roofing/pipelines - List pipelines/stages

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get job counts by stage
  const { data: jobs, error } = await supabase
    .from("roofing_jobs")
    .select("current_stage, projected_job_value")
    .eq("workspace_id", auth.workspaceId);

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  // Aggregate by stage
  const pipeline: Record<string, { count: number; total_value: number }> = {};
  
  (jobs || []).forEach((job) => {
    const stage = job.current_stage || "UNKNOWN";
    if (!pipeline[stage]) {
      pipeline[stage] = { count: 0, total_value: 0 };
    }
    pipeline[stage].count += 1;
    pipeline[stage].total_value += parseFloat(job.projected_job_value || "0");
  });

  // Format response
  const stages = Object.entries(pipeline).map(([stage, stats]) => ({
    stage,
    job_count: stats.count,
    total_value: stats.total_value,
  }));

  return NextResponse.json({
    data: {
      stages,
      total_jobs: jobs?.length || 0,
      total_value: stages.reduce((sum, s) => sum + s.total_value, 0),
    },
  });
});




































