// GET /api/v1/sending-calendar/activity - Get sending calendar activity log

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/v1/sending-calendar/activity
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const searchParams = req.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") || "100", 10);
  const inboxId = searchParams.get("inbox_id");
  const eventType = searchParams.get("event_type");

  let query = supabase
    .from("sending_calendar_activity_log")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (inboxId) {
    query = query.eq("inbox_id", inboxId);
  }

  if (eventType) {
    query = query.eq("event_type", eventType);
  }

  const { data: activities, error } = await query;

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ activities: activities || [] });
});



