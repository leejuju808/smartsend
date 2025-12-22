// POST /v1/roofing/crews/check-in - Crew check-in

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";
import { triggerWebhooks } from "@/lib/api/webhooks";

export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { job_id, crew_id, check_in_location, check_in_time, ...otherFields } = body;

  if (!job_id || !crew_id) {
    throw new ApiError("400_INVALID_BODY", "job_id and crew_id are required");
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

  const checkInData = {
    job_id,
    crew_id,
    check_in_time: check_in_time || new Date().toISOString(),
    check_in_location,
    status: "checked_in",
    ...otherFields,
  };

  // Insert into crew_check_ins table
  const { data: checkIn, error } = await supabase
    .from("crew_check_ins")
    .insert(checkInData)
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  // Trigger webhook
  await triggerWebhooks(auth.workspaceId, "crew.check_in", {
    check_in_id: checkIn.id,
    job_id,
    crew_id,
    check_in_time: checkIn.check_in_time,
    location: checkIn.check_in_location,
  });

  return NextResponse.json({ data: checkIn }, { status: 201 });
});




































