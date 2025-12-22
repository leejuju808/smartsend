// GET /v1/roofing/inspections - List inspections
// POST /v1/roofing/inspections - Create inspection

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";
import { triggerWebhooks } from "@/lib/api/webhooks";

// GET list inspections
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = req.nextUrl;
  const job_id = searchParams.get("job_id");
  const lead_id = searchParams.get("lead_id");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  // Query inspections table (if exists)
  // For now, return structure that matches expected format
  let query = supabase
    .from("inspections")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (job_id) {
    query = query.eq("job_id", job_id);
  }

  if (lead_id) {
    query = query.eq("lead_id", lead_id);
  }

  const { data: inspections, error } = await query;

  if (error && error.code !== "PGRST116") {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({
    data: inspections || [],
    pagination: {
      limit,
      offset,
      count: inspections?.length || 0,
    },
  });
});

// POST create inspection
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { job_id, lead_id, inspection_type, results, notes, ...otherFields } = body;

  if (!job_id && !lead_id) {
    throw new ApiError("400_INVALID_BODY", "job_id or lead_id is required");
  }

  const inspectionData = {
    workspace_id: auth.workspaceId,
    job_id,
    lead_id,
    inspection_type: inspection_type || "roof",
    results: results || {},
    notes,
    inspected_at: new Date().toISOString(),
    ...otherFields,
  };

  // Insert into inspections table
  const { data: inspection, error } = await supabase
    .from("inspections")
    .insert(inspectionData)
    .select()
    .single();

  if (error && error.code !== "PGRST116") {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  // Trigger webhook
  await triggerWebhooks(auth.workspaceId, "inspection.completed", {
    inspection_id: inspection?.id,
    job_id,
    lead_id,
    inspection_type,
    inspected_at: inspectionData.inspected_at,
  });

  return NextResponse.json({ data: inspection || inspectionData }, { status: 201 });
});




































