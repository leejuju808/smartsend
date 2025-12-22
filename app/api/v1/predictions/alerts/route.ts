// GET /v1/predictions/alerts - Get prediction alerts
// PATCH /v1/predictions/alerts/[id] - Acknowledge an alert

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

// GET /v1/predictions/alerts
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const searchParams = req.nextUrl.searchParams;
  const acknowledged = searchParams.get("acknowledged");
  const severity = searchParams.get("severity");

  let query = supabase
    .from("prediction_alerts")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (acknowledged !== null) {
    query = query.eq("acknowledged", acknowledged === "true");
  }

  if (severity) {
    query = query.eq("severity", severity);
  }

  const { data: alerts, error } = await query;

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  const unacknowledgedCount = alerts?.filter((a: any) => !a.acknowledged).length || 0;

  return NextResponse.json({
    data: alerts || [],
    summary: {
      total: alerts?.length || 0,
      unacknowledged: unacknowledgedCount,
      by_severity: {
        critical: alerts?.filter((a: any) => a.severity === "critical").length || 0,
        high: alerts?.filter((a: any) => a.severity === "high").length || 0,
        medium: alerts?.filter((a: any) => a.severity === "medium").length || 0,
        low: alerts?.filter((a: any) => a.severity === "low").length || 0,
      },
    },
  });
});



