// GET /v1/roofing/jobs - List jobs
// POST /v1/roofing/jobs - Create job

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";
import { triggerWebhooks } from "@/lib/api/webhooks";

// GET list jobs
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const stage = searchParams.get("stage");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const lead_id = searchParams.get("lead_id");

  let query = supabase
    .from("roofing_jobs")
    .select(`
      id,
      workspace_id,
      lead_id,
      thread_id,
      contact_id,
      homeowner_name,
      address,
      carrier,
      claim_number,
      current_stage,
      hot_lead_score,
      projected_job_value,
      status_reason,
      created_at,
      updated_at,
      stage_changed_at
    `)
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  if (stage) {
    query = query.eq("current_stage", stage);
  }

  if (lead_id) {
    query = query.eq("lead_id", lead_id);
  }

  const { data: jobs, error } = await query;

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({
    data: jobs || [],
    pagination: {
      limit,
      offset,
      count: jobs?.length || 0,
    },
  });
});

// POST create job
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const {
    lead_id,
    thread_id,
    contact_id,
    homeowner_name,
    address,
    carrier,
    claim_number,
    current_stage = "NEW_LEAD",
    projected_job_value,
    ...otherFields
  } = body;

  if (!lead_id && !thread_id && !contact_id) {
    throw new ApiError("400_INVALID_BODY", "lead_id, thread_id, or contact_id is required");
  }

  const { data: job, error } = await supabase
    .from("roofing_jobs")
    .insert({
      workspace_id: auth.workspaceId,
      lead_id,
      thread_id,
      contact_id,
      homeowner_name,
      address,
      carrier,
      claim_number,
      current_stage,
      projected_job_value,
      ...otherFields,
    })
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  // Trigger webhook
  await triggerWebhooks(auth.workspaceId, "job.created", {
    job_id: job.id,
    lead_id: job.lead_id,
    current_stage: job.current_stage,
    projected_job_value: job.projected_job_value,
    created_at: job.created_at,
  });

  return NextResponse.json({ data: job }, { status: 201 });
});




































