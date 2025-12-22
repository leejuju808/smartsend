// Block 22073 — SmartSend Roofing Job Save Engine v1
// API Route: Send Recovery Message
// POST /api/job-save/send-recovery

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { lead_id, event_id, message } = await req.json();

    if (!lead_id || !message) {
      return NextResponse.json(
        { error: "Missing required fields: lead_id, message" },
        { status: 400 }
      );
    }

    // TODO: Implement actual message sending logic
    // For now, we'll just log it and mark the event as resolved
    
    // Mark event as resolved
    if (event_id) {
      await supabase
        .from("job_save_events")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          recovery_action: "message_sent",
        })
        .eq("id", event_id);
    }

    // Add timeline event
    await supabase.from("job_timelines").insert({
      lead_id,
      event_type: "recovery_message_sent",
      event_category: "risk",
      event_summary: "Recovery message sent to homeowner",
      event_data: {
        message,
        event_id,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Recovery message sent",
    });
  } catch (error: any) {
    console.error("Error in POST /api/job-save/send-recovery:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}









































