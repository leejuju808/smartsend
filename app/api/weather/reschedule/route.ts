/**
 * Block 25300 — SmartSend Roofing Weather Intelligence v1
 * POST /api/weather/reschedule
 * Approve and execute weather reschedule
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const rescheduleSchema = z.object({
  reschedule_id: z.string().uuid(),
  new_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  new_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
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
    const { reschedule_id, new_date, new_time } = rescheduleSchema.parse(body);

    // Get reschedule record
    const { data: reschedule, error: rescheduleError } = await supabase
      .from("weather_reschedules")
      .select("*, workspace_id")
      .eq("id", reschedule_id)
      .single();

    if (rescheduleError || !reschedule) {
      return NextResponse.json(
        { error: "Reschedule not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", reschedule.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Execute reschedule
    const { error: executeError } = await supabase.rpc(
      "execute_weather_reschedule",
      {
        p_reschedule_id: reschedule_id,
        p_new_date: new_date,
        p_new_time: new_time || null,
        p_approved_by: user.id,
      }
    );

    if (executeError) {
      console.error("Error executing reschedule:", executeError);
      return NextResponse.json(
        { error: executeError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Reschedule executed successfully",
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error executing weather reschedule:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}




































