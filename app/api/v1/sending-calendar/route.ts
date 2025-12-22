// GET /api/v1/sending-calendar - Get sending calendar settings
// POST /api/v1/sending-calendar - Update sending calendar settings

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/v1/sending-calendar
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const { data: calendar, error: calendarError } = await supabase
    .from("workspace_sending_calendar")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .maybeSingle();

  if (calendarError) {
    throw new ApiError("500_INTERNAL_ERROR", calendarError.message, 500);
  }

  const { data: rules, error: rulesError } = await supabase
    .from("global_sending_rules")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .maybeSingle();

  if (rulesError) {
    throw new ApiError("500_INTERNAL_ERROR", rulesError.message, 500);
  }

  const { data: holidays, error: holidaysError } = await supabase
    .from("sending_calendar_holidays")
    .select("*")
    .or(`workspace_id.eq.${auth.workspaceId},workspace_id.is.null`)
    .order("start_date", { ascending: true });

  if (holidaysError) {
    throw new ApiError("500_INTERNAL_ERROR", holidaysError.message, 500);
  }

  return NextResponse.json({
    calendar: calendar || null,
    rules: rules || null,
    holidays: holidays || []
  });
});

// POST /api/v1/sending-calendar
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const body = await req.json();
  const { calendar, rules, holidays } = body;

  // Update calendar
  if (calendar) {
    const { error: calendarError } = await supabase
      .from("workspace_sending_calendar")
      .upsert({
        workspace_id: auth.workspaceId,
        ...calendar,
        updated_at: new Date().toISOString()
      });

    if (calendarError) {
      throw new ApiError("500_INTERNAL_ERROR", calendarError.message, 500);
    }
  }

  // Update rules
  if (rules) {
    const { error: rulesError } = await supabase
      .from("global_sending_rules")
      .upsert({
        workspace_id: auth.workspaceId,
        ...rules,
        updated_at: new Date().toISOString()
      });

    if (rulesError) {
      throw new ApiError("500_INTERNAL_ERROR", rulesError.message, 500);
    }
  }

  // Update holidays (only custom ones)
  if (holidays && Array.isArray(holidays)) {
    for (const holiday of holidays) {
      if (holiday.id) {
        // Update existing
        const { error: updateError } = await supabase
          .from("sending_calendar_holidays")
          .update({
            ...holiday,
            updated_at: new Date().toISOString()
          })
          .eq("id", holiday.id)
          .eq("workspace_id", auth.workspaceId);

        if (updateError) {
          throw new ApiError("500_INTERNAL_ERROR", updateError.message, 500);
        }
      } else if (!holiday.id && holiday.holiday_type === 'custom') {
        // Insert new custom holiday
        const { error: insertError } = await supabase
          .from("sending_calendar_holidays")
          .insert({
            workspace_id: auth.workspaceId,
            ...holiday
          });

        if (insertError) {
          throw new ApiError("500_INTERNAL_ERROR", insertError.message, 500);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
});



