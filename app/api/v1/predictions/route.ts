// GET /v1/predictions - Get predictions for workspace
// Query params: metric, horizon_days, campaign_id, step_id, inbox_id, domain

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

// GET /v1/predictions
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const searchParams = req.nextUrl.searchParams;
  const metric = searchParams.get("metric");
  const horizonDays = searchParams.get("horizon_days") ? parseInt(searchParams.get("horizon_days")!, 10) : null;
  const campaignId = searchParams.get("campaign_id");
  const stepId = searchParams.get("step_id");
  const inboxId = searchParams.get("inbox_id");
  const domain = searchParams.get("domain");

  let query = supabase
    .from("predictions")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (metric) {
    query = query.eq("metric", metric);
  }

  if (horizonDays) {
    query = query.eq("horizon_days", horizonDays);
  }

  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }

  if (stepId) {
    query = query.eq("step_id", stepId);
  }

  if (inboxId) {
    query = query.eq("inbox_id", inboxId);
  }

  if (domain) {
    query = query.eq("domain", domain);
  }

  // Only get predictions from last 2 days
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  query = query.gte("created_at", twoDaysAgo.toISOString());

  const { data: predictions, error } = await query;

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  // Group predictions by metric and horizon
  const grouped = (predictions || []).reduce((acc: any, pred: any) => {
    const key = `${pred.metric}_${pred.horizon_days}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(pred);
    return acc;
  }, {});

  return NextResponse.json({
    data: predictions || [],
    grouped,
    summary: {
      total: predictions?.length || 0,
      metrics: [...new Set(predictions?.map((p: any) => p.metric) || [])],
      horizons: [...new Set(predictions?.map((p: any) => p.horizon_days) || [])],
    },
  });
});



