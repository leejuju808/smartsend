// GET /v1/predictions/revenue - Get revenue projections

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const searchParams = req.nextUrl.searchParams;
  const horizonDays = searchParams.get("horizon_days") ? parseInt(searchParams.get("horizon_days")!, 10) : 30;

  const { data, error } = await supabase.rpc("get_revenue_projection", {
    p_workspace_id: auth.workspaceId,
    p_horizon_days: horizonDays,
  });

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({
    data: data?.[0] || null,
    horizon_days: horizonDays,
  });
});



