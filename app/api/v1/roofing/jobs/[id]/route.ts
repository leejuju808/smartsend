// GET /v1/roofing/jobs/:id - Get single job
// PATCH /v1/roofing/jobs/:id - Update job

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";
import { triggerWebhooks } from "@/lib/api/webhooks";

// GET single job
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
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (error || !job) {
    throw new ApiError("404_NOT_FOUND", "Job not found", 404);
  }

  return NextResponse.json({ data: job });
});

// PATCH update job
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
  const { current_stage, projected_job_value, status_reason, ...otherFields } = body;

  const updates: any = {
    updated_at: new Date().toISOString(),
  };

  if (current_stage !== undefined) {
    updates.current_stage = current_stage;
    updates.stage_changed_at = new Date().toISOString();
  }
  if (projected_job_value !== undefined) updates.projected_job_value = projected_job_value;
  if (status_reason !== undefined) updates.status_reason = status_reason;
  Object.assign(updates, otherFields);

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

  // Trigger webhooks
  if (current_stage !== undefined) {
    await triggerWebhooks(auth.workspaceId, "job.stage.changed", {
      job_id: job.id,
      old_stage: body.previous_stage,
      new_stage: current_stage,
      changed_at: job.stage_changed_at,
    });
  }

  await triggerWebhooks(auth.workspaceId, "job.updated", {
    job_id: job.id,
    changes: updates,
    updated_at: job.updated_at,
  });

  return NextResponse.json({ data: job });
});




































