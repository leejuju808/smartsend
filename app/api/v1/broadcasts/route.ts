// POST /v1/broadcasts - Create broadcast

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const {
    name,
    subject,
    body: bodyText,
    segment_id,
    scheduled_at,
    throttle_per_minute,
  } = body;

  if (!name || !subject || !bodyText || !segment_id) {
    throw new ApiError(
      "400_INVALID_BODY",
      "name, subject, body, and segment_id are required"
    );
  }

  const { data: broadcast, error } = await supabase
    .from("broadcasts")
    .insert({
      workspace_id: auth.workspaceId,
      name,
      subject,
      body: bodyText,
      segment_id,
      scheduled_at: scheduled_at || null,
      throttle_per_minute: throttle_per_minute || 30,
      status: scheduled_at ? "scheduled" : "draft",
    })
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ data: broadcast }, { status: 201 });
});



