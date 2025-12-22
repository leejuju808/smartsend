import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/activity-feed
 * Fetch roofing activity feed events
 * 
 * Query params:
 * - campaign_id: Filter by campaign
 * - lead_id: Filter by lead
 * - job_id: Filter by job
 * - thread_id: Filter by thread
 * - event_types: Comma-separated list of event types
 * - limit: Number of events to return (default: 50)
 * - offset: Pagination offset (default: 0)
 * - hours_back: Hours to look back (default: 24)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaign_id");
    const leadId = searchParams.get("lead_id");
    const jobId = searchParams.get("job_id");
    const threadId = searchParams.get("thread_id");
    const eventTypesParam = searchParams.get("event_types");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const hoursBack = parseInt(searchParams.get("hours_back") || "24", 10);

    // Parse event types
    const eventTypes = eventTypesParam
      ? eventTypesParam.split(",").map((t) => t.trim())
      : null;

    // Call the database function
    const { data: events, error } = await supabase.rpc("get_activity_feed", {
      p_campaign_id: campaignId || null,
      p_lead_id: leadId || null,
      p_job_id: jobId || null,
      p_thread_id: threadId || null,
      p_event_types: eventTypes,
      p_limit: limit,
      p_offset: offset,
      p_hours_back: hoursBack,
    });

    if (error) {
      console.error("Error fetching activity feed:", error);
      return NextResponse.json(
        { error: "Failed to fetch activity feed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ events: events || [] });
  } catch (error) {
    console.error("Error in activity feed API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
















































