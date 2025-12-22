// GET /api/v1/sending-calendar/inboxes/[inboxId] - Get inbox calendar override
// POST /api/v1/sending-calendar/inboxes/[inboxId] - Update inbox calendar override

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/v1/sending-calendar/inboxes/[inboxId]
export const GET = withApiAuth(async (
  req: NextRequest,
  auth,
  { params }: { params: { inboxId: string } }
) => {
  const { data: inboxCalendar, error } = await supabase
    .from("inbox_sending_calendar")
    .select("*")
    .eq("inbox_id", params.inboxId)
    .eq("workspace_id", auth.workspaceId)
    .maybeSingle();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ calendar: inboxCalendar || null });
});

// POST /api/v1/sending-calendar/inboxes/[inboxId]
export const POST = withApiAuth(async (
  req: NextRequest,
  auth,
  { params }: { params: { inboxId: string } }
) => {
  const body = await req.json();
  const { override_enabled, allowed_days, allowed_time_windows, timezone } = body;

  // Get workspace_id from inbox
  const { data: inbox, error: inboxError } = await supabase
    .from("sender_inboxes")
    .select("workspace_id")
    .eq("id", params.inboxId)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (inboxError || !inbox) {
    throw new ApiError("404_NOT_FOUND", "Inbox not found", 404);
  }

  const { error } = await supabase
    .from("inbox_sending_calendar")
    .upsert({
      inbox_id: params.inboxId,
      workspace_id: auth.workspaceId,
      override_enabled: override_enabled ?? false,
      allowed_days: allowed_days || null,
      allowed_time_windows: allowed_time_windows || null,
      timezone: timezone || null,
      updated_at: new Date().toISOString()
    });

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ ok: true });
});



