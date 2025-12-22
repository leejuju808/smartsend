// app/api/campaigns/steps/update/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const body = (await req.json()) as {
      id?: string;
      enabled?: boolean;
      delayDays?: number;
    };

    if (!body.id) {
      return NextResponse.json(
        { error: "Step id is required" },
        { status: 400 }
      );
    }

    const update: Record<string, any> = {};

    if (typeof body.enabled === "boolean") {
      update.enabled = body.enabled;
    }

    if (typeof body.delayDays === "number") {
      update.delay_days = body.delayDays;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("campaign_steps")
      .update(update)
      .eq("id", body.id);

    if (error) {
      console.error("Error updating campaign step:", error);
      return NextResponse.json(
        { error: "Failed to update step", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/campaigns/steps/update error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}


























































