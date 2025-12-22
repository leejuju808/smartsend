// app/api/campaigns/schedule-initial/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const body = (await req.json()) as {
      campaignId?: string;
    };

    if (!body.campaignId) {
      return NextResponse.json(
        { error: "campaignId is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc(
      "queue_campaign_initial_emails",
      { p_campaign_id: body.campaignId }
    );

    if (error) {
      console.error("queue_campaign_initial_emails error:", error);

      if (error.message && error.message.includes("EMAIL_CAP_REACHED")) {
        return NextResponse.json(
          {
            error: "email_cap_reached",
            message:
              "You've hit the monthly email cap for your current plan. Upgrade to send more emails this month.",
          },
          { status: 402 }
        );
      }

      return NextResponse.json(
        {
          error: "Failed to queue initial emails",
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, queued: data ?? 0 },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("POST /api/campaigns/schedule-initial error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}

