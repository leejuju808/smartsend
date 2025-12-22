// app/api/inbox/tracking/events/route.ts
// Block 19760 — Inbox Success Tracking & Feedback Loop v1
// API endpoint for tracking usage events

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      event_type,
      metadata = {},
      thread_id,
      campaign_id,
      session_id,
      is_mobile = false,
      user_agent,
      platform = "web",
    } = body;

    if (!event_type) {
      return NextResponse.json(
        { error: "event_type is required" },
        { status: 400 }
      );
    }

    // Get user's workspace_id if available
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    const workspace_id = workspaceMember?.workspace_id || null;

    // Insert usage event
    const { data, error } = await supabase
      .from("inbox_usage_events")
      .insert({
        user_id: user.id,
        workspace_id,
        campaign_id: campaign_id || null,
        thread_id: thread_id || null,
        event_type,
        metadata,
        is_mobile,
        user_agent: user_agent || null,
        platform,
        session_id: session_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error tracking usage event:", error);
      return NextResponse.json(
        { error: error.message || "Failed to track event" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error in usage event tracking:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































