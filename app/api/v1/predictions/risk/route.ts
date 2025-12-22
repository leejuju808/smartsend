// GET /v1/predictions/risk - Get risk predictions for inboxes/domains

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const searchParams = req.nextUrl.searchParams;
  const entityType = searchParams.get("entity_type") || "inbox"; // 'inbox' or 'domain'
  const horizonDays = searchParams.get("horizon_days") ? parseInt(searchParams.get("horizon_days")!, 10) : 7;

  const { data, error } = await supabase.rpc("get_risk_predictions", {
    p_workspace_id: auth.workspaceId,
    p_entity_type: entityType,
    p_horizon_days: horizonDays,
  });

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({
    data: data || [],
    entity_type: entityType,
    horizon_days: horizonDays,
  });
});



