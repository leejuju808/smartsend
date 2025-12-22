// GET /v1/roofing/jobs/:id/status - Get job status
// PATCH /v1/roofing/jobs/:id/status - Update job status

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";
import { triggerWebhooks } from "@/lib/api/webhooks";

export const GET = withApiAuth(async (
  req: NextRequest,
  auth,
  { params }: { params: { id: string } }
) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: job, error } = await supabase
    .from("roofing_jobs")
    .select("id, current_stage, status_reason, stage_changed_at, updated_at")
    .eq("id", params.id)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (error || !job) {
    throw new ApiError("404_NOT_FOUND", "Job not found", 404);
  }

  return NextResponse.json({
    data: {
      job_id: job.id,
      status: job.current_stage,
      status_reason: job.status_reason,
      stage_changed_at: job.stage_changed_at,
      updated_at: job.updated_at,
    },
  });
});

export const PATCH = withApiAuth(async (
  req: NextRequest,
  auth,
  { params }: { params: { id: string } }
) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { status, reason } = body;

  if (!status) {
    throw new ApiError("400_INVALID_BODY", "status is required");
  }

  const updates: any = {
    current_stage: status,
    stage_changed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (reason) {
    updates.status_reason = reason;
  }

  const { data: job, error } = await supabase
    .from("roofing_jobs")
    .update(updates)
    .eq("id", params.id)
    .eq("workspace_id", auth.workspaceId)
    .select()
    .single();

  if (error || !job) {
    throw new ApiError("404_NOT_FOUND", "Job not found", 404);
  }

  // Trigger webhook
  await triggerWebhooks(auth.workspaceId, "job.stage.changed", {
    job_id: job.id,
    new_stage: status,
    reason,
    changed_at: job.stage_changed_at,
  });

  return NextResponse.json({ data: job });
});




































