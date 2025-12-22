// app/api/revenue-snapshot/route.ts
// Block 21450: Revenue Snapshot API Route
// Returns total pipeline, expected revenue, and high-value jobs count

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1) Fetch all job value estimates for this user
  // RLS on job_value_estimates (via contacts) ensures we only see rows tied to this user's workspace.
  const { data, error } = await supabase
    .from("job_value_estimates")
    .select("base_amount, expected_value");

  if (error) {
    console.error("Revenue snapshot error:", error);
    return NextResponse.json({ error: "Fetch failed" }, { status: 400 });
  }

  const estimates = data ?? [];

  let totalPipeline = 0;
  let totalExpected = 0;
  let highValueJobs = 0;

  for (const row of estimates as any[]) {
    const base = Number(row.base_amount) || 0;
    const expected = Number(row.expected_value) || 0;
    totalPipeline += base;
    totalExpected += expected;
    if (base >= 15000) highValueJobs += 1;
  }

  return NextResponse.json({
    total_pipeline: Math.round(totalPipeline),
    total_expected: Math.round(totalExpected),
    high_value_jobs: highValueJobs,
  });
}














































