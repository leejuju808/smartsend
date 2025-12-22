// GET /api/v1/sending-calendar/advisor-alerts - Get AI Advisor alerts for calendar

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/v1/sending-calendar/advisor-alerts
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const { data: alerts, error } = await supabase.rpc(
    "generate_calendar_advisor_alerts",
    {
      p_workspace_id: auth.workspaceId
    }
  );

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json(alerts || { alerts: [], count: 0 });
});



