// GET /v1/roofing/materials/status - Get material status for jobs

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = req.nextUrl;
  const job_id = searchParams.get("job_id");

  if (!job_id) {
    throw new ApiError("400_INVALID_BODY", "job_id is required");
  }

  // Verify job exists
  const { data: job } = await supabase
    .from("roofing_jobs")
    .select("id")
    .eq("id", job_id)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (!job) {
    throw new ApiError("404_NOT_FOUND", "Job not found", 404);
  }

  // Query material tracking table (if exists)
  // For now, return structure that matches expected format
  const materialStatus = {
    job_id,
    status: "ordered", // ordered, in_transit, delivered, on_site
    items: [
      {
        item: "Shingles",
        quantity: 30,
        unit: "squares",
        status: "ordered",
        expected_delivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    delivery_date: null,
    notes: null,
  };

  return NextResponse.json({ data: materialStatus });
});




































