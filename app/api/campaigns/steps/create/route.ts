// app/api/campaigns/steps/create/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const body = (await req.json()) as {
      campaignId?: string;
      subject?: string;
      body?: string;
      delayDays?: number;
    };

    if (!body.campaignId) {
      return NextResponse.json(
        { error: "campaignId is required" },
        { status: 400 }
      );
    }

    if (!body.subject || !body.subject.trim()) {
      return NextResponse.json(
        { error: "subject is required" },
        { status: 400 }
      );
    }

    if (!body.body || !body.body.trim()) {
      return NextResponse.json(
        { error: "body is required" },
        { status: 400 }
      );
    }

    const delayDays =
      typeof body.delayDays === "number" ? body.delayDays : 0;

    // 1) compute next step_order
    const { data: nextOrderData, error: nextOrderError } = await supabase.rpc(
      "next_campaign_step_order",
      { p_campaign_id: body.campaignId }
    );

    if (nextOrderError) {
      console.error("next_campaign_step_order error:", nextOrderError);
      return NextResponse.json(
        { error: "Failed to compute step order" },
        { status: 500 }
      );
    }

    const stepOrder = Number(nextOrderData ?? 1);

    // 2) insert step
    const { data, error } = await supabase
      .from("campaign_steps")
      .insert({
        campaign_id: body.campaignId,
        step_order: stepOrder,
        delay_days: delayDays,
        subject: body.subject.trim(),
        body: body.body.trim(),
      })
      .select("id, step_order")
      .maybeSingle();

    if (error) {
      console.error("Error creating campaign step:", error);
      return NextResponse.json(
        { error: "Failed to create step", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, stepId: data?.id, stepOrder: data?.step_order },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("POST /api/campaigns/steps/create error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}


























































