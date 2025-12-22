// app/api/campaigns/[id]/analytics/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const campaignId = params.id;

  // Get totals using RPC function
  const { data: totals, error: totalsError } = await supabase.rpc(
    "campaign_event_stats",
    {
      p_campaign_id: campaignId,
    }
  );

  // Get step-level stats using RPC function
  const { data: steps, error: stepsError } = await supabase.rpc(
    "campaign_step_stats",
    {
      p_campaign_id: campaignId,
    }
  );

  // Get timeseries data using RPC function
  const { data: timeseries, error: timeseriesError } = await supabase.rpc(
    "campaign_timeseries",
    {
      p_campaign_id: campaignId,
    }
  );

  if (totalsError || stepsError || timeseriesError) {
    console.error("Analytics RPC errors:", {
      totalsError,
      stepsError,
      timeseriesError,
    });
    return NextResponse.json(
      {
        error: "Failed to fetch analytics",
        details: {
          totalsError: totalsError?.message,
          stepsError: stepsError?.message,
          timeseriesError: timeseriesError?.message,
        },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    totals: totals || {
      sent: 0,
      delivered: 0,
      open: 0,
      click: 0,
      reply: 0,
      bounce: 0,
    },
    steps: steps || [],
    timeseries: timeseries || [],
  });
}










