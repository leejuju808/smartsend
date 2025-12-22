// Block 14200 — SmartSend Timeline v2
// GET /api/contacts/[id]/activity
// Unified timeline endpoint that aggregates all event sources

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    // Get current workspace
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Verify contact exists and belongs to workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id, email")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found or access denied" },
        { status: 404 }
      );
    }

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const typesParam = searchParams.get("types");
    const types = typesParam ? typesParam.split(",") : null;
    const dateFilter = searchParams.get("dateFilter"); // "week", "month", "year", "all"

    // Calculate date threshold for filtering
    let dateThreshold: Date | null = null;
    if (dateFilter === "week") {
      dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - 7);
    } else if (dateFilter === "month") {
      dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - 30);
    } else if (dateFilter === "year") {
      dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - 365);
    }

    // Aggregate events from timeline_events table (primary source)
    let timelineQuery = supabase
      .from("timeline_events")
      .select(`
        *,
        user:user_id (
          id,
          email,
          raw_user_meta_data
        )
      `)
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(limit * 2); // Get more to account for other sources

    if (types && types.length > 0) {
      timelineQuery = timelineQuery.in("event_type", types);
    }

    if (dateThreshold) {
      timelineQuery = timelineQuery.gte("created_at", dateThreshold.toISOString());
    }

    if (cursor) {
      const [cursorTime, cursorId] = cursor.split("|");
      timelineQuery = timelineQuery.or(
        `created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${cursorId})`
      );
    }

    const { data: timelineEvents, error: timelineError } = await timelineQuery;

    // Also fetch from contact_activity for backward compatibility
    let activityQuery = supabase
      .from("contact_activity")
      .select(`
        *,
        user:created_by (
          id,
          email,
          raw_user_meta_data
        )
      `)
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(limit * 2);

    if (types && types.length > 0) {
      activityQuery = activityQuery.in("activity_type", types);
    }

    if (dateThreshold) {
      activityQuery = activityQuery.gte("created_at", dateThreshold.toISOString());
    }

    const { data: activities } = await activityQuery;

    // Fetch lead score events
    let scoreQuery = supabase
      .from("lead_score_events")
      .select("*")
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (dateThreshold) {
      scoreQuery = scoreQuery.gte("created_at", dateThreshold.toISOString());
    }

    const { data: scoreEvents } = await scoreQuery;

    // Combine and transform all events
    const allEvents: any[] = [];

    // Transform timeline_events
    if (timelineEvents) {
      for (const event of timelineEvents) {
        const eventData = event.event_data || {};
        let title = "";
        let body = "";

        // Generate title and body based on event type
        switch (event.event_type) {
          case "email_sent":
            title = `Sent ${eventData.subject || "email"}`;
            if (eventData.campaign_name) {
              title = `Sent Step ${eventData.step || ""} of ${eventData.campaign_name}`.trim();
            }
            body = eventData.preview || "";
            break;
          case "reply_received":
            title = "Homeowner replied";
            if (eventData.intent_label) {
              title = `Homeowner replied (${eventData.intent_label})`;
            }
            body = eventData.snippet || "";
            break;
          case "task_created":
            title = `Task created: ${eventData.title || eventData.task_type || "Task"}`;
            body = eventData.reason || "";
            break;
          case "task_completed":
            title = `Task completed: ${eventData.title || "Task"}`;
            body = eventData.completion_reason || "";
            break;
          case "status_changed":
            title = `Status changed: ${eventData.old_status || "None"} → ${eventData.new_status || ""}`;
            break;
          case "score_changed":
            title = `Lead score changed: ${eventData.old_score || 0} → ${eventData.new_score || 0}`;
            body = eventData.reason || "";
            break;
          case "tag_added":
            title = `Tag added: ${eventData.tag || ""}`;
            break;
          case "tag_removed":
            title = `Tag removed: ${eventData.tag || ""}`;
            break;
          case "pipeline_moved":
            title = `Pipeline moved: ${eventData.old_stage || "None"} → ${eventData.new_stage || ""}`;
            break;
          case "enrichment_added":
            title = "Enrichment added";
            body = Object.keys(eventData).map(k => `${k}: ${eventData[k]}`).join(", ");
            break;
          case "suppressed":
            title = "Suppressed / Unsubscribed";
            body = eventData.reason || "";
            break;
          case "campaign_step":
            title = `Campaign step triggered: ${eventData.step || ""}`;
            break;
          case "note":
            title = "Note added";
            body = eventData.body || "";
            break;
          case "storm_event":
            title = `Storm detected: ${eventData.storm_type || ""}`;
            break;
          default:
            title = event.event_type.replace(/_/g, " ");
        }

        allEvents.push({
          id: event.id,
          type: event.event_type,
          occurred_at: event.created_at,
          createdAt: event.created_at,
          title,
          body,
          meta: {
            ...eventData,
            message_id: event.message_id,
            task_id: event.task_id,
            campaign_id: event.campaign_id,
            thread_id: event.thread_id,
            note_id: event.note_id,
          },
          created_by: event.user_id,
          user: event.user ? {
            id: event.user.id,
            email: event.user.email,
            name: event.user.raw_user_meta_data?.full_name || event.user.email,
          } : null,
        });
      }
    }

    // Transform contact_activity events (backward compatibility)
    if (activities) {
      for (const activity of activities) {
        // Skip if already in timeline_events (avoid duplicates)
        if (!allEvents.find(e => e.id === activity.id)) {
          allEvents.push({
            id: activity.id,
            type: activity.activity_type,
            occurred_at: activity.created_at,
            createdAt: activity.created_at,
            title: activity.title,
            body: activity.body,
            meta: activity.meta || {},
            created_by: activity.created_by,
            user: activity.user ? {
              id: activity.user.id,
              email: activity.user.email,
              name: activity.user.raw_user_meta_data?.full_name || activity.user.email,
            } : null,
          });
        }
      }
    }

    // Transform score events
    if (scoreEvents) {
      for (const scoreEvent of scoreEvents) {
        allEvents.push({
          id: `score-${scoreEvent.id}`,
          type: "score_changed",
          occurred_at: scoreEvent.created_at,
          createdAt: scoreEvent.created_at,
          title: `Lead score changed: ${scoreEvent.old_score} → ${scoreEvent.new_score}`,
          body: scoreEvent.reason || "",
          meta: {
            old_score: scoreEvent.old_score,
            new_score: scoreEvent.new_score,
            delta: scoreEvent.delta,
            reason: scoreEvent.reason,
            metadata: scoreEvent.metadata,
          },
          created_by: null,
          user: null,
        });
      }
    }

    // Sort all events by created_at descending
    allEvents.sort((a, b) => {
      const dateA = new Date(a.created_at || a.occurred_at).getTime();
      const dateB = new Date(b.created_at || b.occurred_at).getTime();
      return dateB - dateA;
    });

    // Apply limit and pagination
    const hasMore = allEvents.length > limit;
    const resultEvents = hasMore ? allEvents.slice(0, limit) : allEvents;

    // Generate next cursor
    const nextCursor = hasMore && resultEvents.length > 0
      ? `${resultEvents[resultEvents.length - 1].created_at}|${resultEvents[resultEvents.length - 1].id}`
      : null;

    return NextResponse.json({
      events: resultEvents,
      nextCursor,
    });
  } catch (error: any) {
    console.error("[Contact Timeline v2] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
