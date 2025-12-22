// Block 16300 — SmartSend Pipeline v2 Auto-Move Worker
// POST /api/cron/pipeline/auto-move
// Automatically moves contacts to appropriate pipeline stages based on triggers

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check for cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let processedCount = 0;
    let movedCount = 0;

    // 1. Process replies that need pipeline movement
    const { data: recentReplies } = await supabase
      .from("inbox_messages")
      .select(`
        id,
        contact_id,
        body_text,
        received_at,
        workspace_id
      `)
      .eq("direction", "in")
      .is("contact_id", null)
      .gte("received_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(100);

    for (const reply of recentReplies || []) {
      if (!reply.contact_id || !reply.workspace_id) continue;

      const { data: newStageKey } = await supabase.rpc("auto_move_pipeline_stage", {
        p_contact_id: reply.contact_id,
        p_trigger_type: "reply",
        p_trigger_data: JSON.stringify({
          reply_text: reply.body_text || "",
          reason: "auto-detected from reply",
        }),
      });

      if (newStageKey) {
        movedCount++;
      }
      processedCount++;
    }

    // 2. Process scheduler bookings
    const { data: recentBookings } = await supabase
      .from("schedule_bookings")
      .select(`
        id,
        contact_id,
        status,
        start_time,
        workspace_id
      `)
      .in("status", ["booked", "completed"])
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(100);

    for (const booking of recentBookings || []) {
      if (!booking.contact_id || !booking.workspace_id) continue;

      const { data: newStageKey } = await supabase.rpc("auto_move_pipeline_stage", {
        p_contact_id: booking.contact_id,
        p_trigger_type: "scheduler",
        p_trigger_data: JSON.stringify({
          action: booking.status === "completed" ? "completed" : "booked",
          reason: "scheduler booking",
        }),
      });

      if (newStageKey) {
        movedCount++;
      }
      processedCount++;
    }

    // 3. Process weather/storm triggers
    const { data: stormImpacts } = await supabase
      .from("contact_storm_impacts")
      .select(`
        contact_id,
        storm_risk_score,
        storm_risk_level,
        weather_event_id,
        workspace_id
      `)
      .gte("detected_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(100);

    for (const impact of stormImpacts || []) {
      if (!impact.contact_id || !impact.workspace_id) continue;

      const { data: newStageKey } = await supabase.rpc("auto_move_pipeline_stage", {
        p_contact_id: impact.contact_id,
        p_trigger_type: "weather",
        p_trigger_data: JSON.stringify({
          storm_risk_score: impact.storm_risk_score,
          storm_risk_level: impact.storm_risk_level,
          reason: "storm detected",
        }),
      });

      if (newStageKey) {
        movedCount++;
      }
      processedCount++;
    }

    return NextResponse.json({
      success: true,
      processed: processedCount,
      moved: movedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Pipeline Auto-Move] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































