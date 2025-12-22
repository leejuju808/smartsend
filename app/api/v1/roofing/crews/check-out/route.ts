// POST /v1/roofing/crews/check-out - Crew check-out

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
  const {
    check_in_id,
    check_out_time,
    check_out_location,
    tasks_completed,
    cleanup_confirmed,
    ...otherFields
  } = body;

  if (!check_in_id) {
    throw new ApiError("400_INVALID_BODY", "check_in_id is required");
  }

  // Get check-in record
  const { data: checkIn } = await supabase
    .from("crew_check_ins")
    .select("*, job_id, crew_id")
    .eq("id", check_in_id)
    .single();

  if (!checkIn) {
    throw new ApiError("404_NOT_FOUND", "Check-in not found", 404);
  }

  // Verify job belongs to workspace
  const { data: job } = await supabase
    .from("roofing_jobs")
    .select("id")
    .eq("id", checkIn.job_id)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (!job) {
    throw new ApiError("403_FORBIDDEN", "Job not found in workspace", 403);
  }

  const updates = {
    check_out_time: check_out_time || new Date().toISOString(),
    check_out_location,
    tasks_completed,
    cleanup_confirmed,
    status: "checked_out",
    ...otherFields,
  };

  const { data: updatedCheckIn, error } = await supabase
    .from("crew_check_ins")
    .update(updates)
    .eq("id", check_in_id)
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  // Trigger webhook
  await triggerWebhooks(auth.workspaceId, "crew.check_out", {
    check_in_id: updatedCheckIn.id,
    job_id: checkIn.job_id,
    crew_id: checkIn.crew_id,
    check_out_time: updatedCheckIn.check_out_time,
  });

  return NextResponse.json({ data: updatedCheckIn });
});




































