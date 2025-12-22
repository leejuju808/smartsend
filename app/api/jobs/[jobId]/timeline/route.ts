// Block 24620 — SmartSend Roofing Job Timeline v2 API
// GET /api/jobs/[jobId]/timeline
// Fetches chronological timeline events for a roofing job with filtering support

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const supabase = createClient();
    const { jobId } = params;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Verify user has access to this job
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, lead_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Parse query parameters
    const url = new URL(req.url);
    const eventCategory = url.searchParams.get("category");
    const eventType = url.searchParams.get("eventType");
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Build query - get events for this job or its associated lead
    let query = supabase
      .from("job_timelines")
      .select("*")
      .eq("job_id", jobId);
    
    // Also include events from the lead if it exists
    if (job.lead_id) {
      query = query.or(`job_id.eq.${jobId},lead_id.eq.${job.lead_id}`);
    }
    
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (eventCategory) {
      query = query.eq("event_category", eventCategory);
    }
    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    const { data: events, error: eventsError } = await query;

    if (eventsError) {
      console.error("Error fetching timeline events:", eventsError);
      return NextResponse.json(
        { error: eventsError.message || "Failed to fetch timeline events" },
        { status: 500 }
      );
    }

    // Group events by date for chronological display
    const groupedEvents = groupEventsByDate(events || []);

    return NextResponse.json({
      events: events || [],
      groupedEvents,
      total: events?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in timeline API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to group events by date
function groupEventsByDate(events: any[]) {
  const grouped: Record<string, any[]> = {};

  events.forEach((event) => {
    const date = new Date(event.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    if (!grouped[date]) {
      grouped[date] = [];
    }

    grouped[date].push(event);
  });

  return grouped;
}

