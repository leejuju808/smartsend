/**
 * Block 25300 — SmartSend Roofing Weather Intelligence v1
 * POST /api/weather/check-scheduling
 * Checks weather when scheduling an install and returns blocking/warning decision
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const checkSchema = z.object({
  workspace_id: z.string().uuid(),
  location_zip: z.string(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Verify user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workspace_id, location_zip, scheduled_date, scheduled_time } =
      checkSchema.parse(body);

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check weather and get blocking decision
    const { data: result, error } = await supabase.rpc(
      "check_weather_and_block_scheduling",
      {
        p_workspace_id: workspace_id,
        p_location_zip: location_zip,
        p_scheduled_date: scheduled_date,
        p_scheduled_time: scheduled_time || null,
      }
    );

    if (error) {
      console.error("Error checking weather:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error checking weather for scheduling:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}




































