// GET /v1/roofing/crews/assignments - List crew assignments
// POST /v1/roofing/crews/assignments - Assign crew to job

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";
import { triggerWebhooks } from "@/lib/api/webhooks";

// GET list crew assignments
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = req.nextUrl;
  const job_id = searchParams.get("job_id");
  const crew_id = searchParams.get("crew_id");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  let query = supabase
    .from("job_crew_assignments")
    .select(`
      id,
      job_id,
      crew_id,
      assigned_at,
      assigned_by,
      assignment_notes,
      status,
      created_at,
      updated_at
    `)
    .eq("workspace_id", auth.workspaceId)
    .order("assigned_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (job_id) {
    query = query.eq("job_id", job_id);
  }

  if (crew_id) {
    query = query.eq("crew_id", crew_id);
  }

  const { data: assignments, error } = await query;

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({
    data: assignments || [],
    pagination: {
      limit,
      offset,
      count: assignments?.length || 0,
    },
  });
});

// POST assign crew
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { job_id, crew_id, assignment_notes, ...otherFields } = body;

  if (!job_id || !crew_id) {
    throw new ApiError("400_INVALID_BODY", "job_id and crew_id are required");
  }

  // Verify job exists and belongs to workspace
  const { data: job } = await supabase
    .from("roofing_jobs")
    .select("id")
    .eq("id", job_id)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (!job) {
    throw new ApiError("404_NOT_FOUND", "Job not found", 404);
  }

  const { data: assignment, error } = await supabase
    .from("job_crew_assignments")
    .insert({
      workspace_id: auth.workspaceId,
      job_id,
      crew_id,
      assignment_notes,
      assigned_at: new Date().toISOString(),
      ...otherFields,
    })
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  // Trigger webhook
  await triggerWebhooks(auth.workspaceId, "crew.assigned", {
    assignment_id: assignment.id,
    job_id,
    crew_id,
    assigned_at: assignment.assigned_at,
  });

  return NextResponse.json({ data: assignment }, { status: 201 });
});




































