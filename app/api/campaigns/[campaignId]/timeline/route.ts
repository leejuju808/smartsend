import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TimelineEvent, TimelineEventType } from "@/app/api/leads/[leadId]/timeline/route";

/**
 * GET /api/campaigns/:campaignId/timeline?limit=50&cursor=...
 * 
 * Returns a unified timeline of recent events across all leads in a campaign.
 * Useful for seeing live action from a campaign.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const supabase = createClient();
  const { campaignId } = await params;
  const { searchParams } = new URL(req.url);

  // Get current user for auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(100, parseInt(searchParams.get("limit") || "50"));
  const cursor = searchParams.get("cursor"); // ISO timestamp for pagination
  const filter = searchParams.get("filter"); // all, replies, hot_warm, auto_follow_ups

  // Step 1: Get all contact_ids for this campaign
  // We'll get them from lead_auto_follow_up_stats which links contacts to campaigns
  const { data: campaignContacts } = await supabase
    .from("lead_auto_follow_up_stats")
    .select("contact_id")
    .eq("campaign_id", campaignId)
    .not("contact_id", "is", null);

  if (!campaignContacts || campaignContacts.length === 0) {
    return NextResponse.json({
      events: [],
      has_more: false,
      next_cursor: null,
    });
  }

  const contactIds = campaignContacts.map((c) => c.contact_id).filter(Boolean) as string[];

  // Step 2: Fetch events from each table for all contacts in this campaign
  const events: TimelineEvent[] = [];

  // 2a) Messages (emails)
  let messagesQuery = supabase
    .from("messages")
    .select("id, direction, subject, created_at, intent, reply_summary, reply_next_action, campaign_id, contact_id")
    .eq("campaign_id", campaignId)
    .in("contact_id", contactIds)
    .order("created_at", { ascending: false });

  if (cursor) {
    messagesQuery = messagesQuery.lt("created_at", cursor);
  }

  if (filter === "replies") {
    messagesQuery = messagesQuery.in("direction", ["inbound", "in", "incoming"]);
  }

  const { data: messages } = await messagesQuery.limit(limit * 2);

  if (messages) {
    for (const msg of messages) {
      const direction = (msg.direction || "").toLowerCase();
      const isOutbound = direction === "outbound" || direction === "outgoing";
      
      if (isOutbound) {
        if (filter === "replies") continue; // Skip outbound if filtering for replies
        
        events.push({
          id: `msg-out-${msg.id}`,
          type: "email_outbound",
          created_at: msg.created_at,
          message_id: msg.id,
          title: "Email sent",
          description: msg.subject || "Campaign email sent",
          meta: {
            subject: msg.subject,
            message_id: msg.id,
            contact_id: msg.contact_id,
          },
        });
      } else {
        // Inbound email (inbound, incoming, in, or any other value)
        if (filter === "hot_warm" && msg.intent !== "hot" && msg.intent !== "warm") {
          continue; // Skip if filtering for hot/warm only
        }

        let title = "Homeowner replied";
        if (msg.intent === "hot") {
          title = "Homeowner replied (HOT)";
        } else if (msg.intent === "warm") {
          title = "Homeowner replied (Warm)";
        } else if (msg.intent === "not_interested") {
          title = "Homeowner not interested";
        } else if (msg.intent === "unsubscribe") {
          title = "Unsubscribe request";
        }

        events.push({
          id: `msg-in-${msg.id}`,
          type: "email_inbound",
          created_at: msg.created_at,
          message_id: msg.id,
          title,
          description: msg.reply_summary || "Reply received",
          meta: {
            intent: msg.intent,
            next_action: msg.reply_next_action,
            message_id: msg.id,
            contact_id: msg.contact_id,
          },
        });
      }
    }
  }

  // 2b) Follow-up events
  if (filter !== "replies") {
    let followUpQuery = supabase
      .from("follow_up_events")
      .select("id, event_type, details, created_at, campaign_id, contact_id")
      .eq("campaign_id", campaignId)
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false });

    if (cursor) {
      followUpQuery = followUpQuery.lt("created_at", cursor);
    }

    if (filter === "auto_follow_ups") {
      // Only include scheduled_follow_up events
      followUpQuery = followUpQuery.eq("event_type", "scheduled_follow_up");
    }

    const { data: followUpEvents } = await followUpQuery.limit(limit * 2);

    if (followUpEvents) {
      for (const event of followUpEvents) {
        let title = "Auto follow-up event";
        const eventType = event.event_type as string;

        if (eventType === "scheduled_follow_up") {
          title = "Auto follow-up scheduled";
        } else if (eventType === "stopped_by_positive_intent") {
          title = "Auto follow-ups stopped (Positive reply)";
        } else if (eventType === "stopped_by_negative_intent") {
          title = "Auto follow-ups stopped (Not interested/unsubscribe)";
        } else if (eventType === "skipped_due_to_suppression") {
          title = "Follow-up skipped (Suppressed)";
        } else if (eventType === "stopped_by_pipeline_stage") {
          title = "Auto follow-ups stopped (Pipeline stage change)";
        } else if (eventType === "stopped_by_manual_action") {
          title = "Auto follow-ups stopped (Manual action)";
        }

        events.push({
          id: `follow-up-${event.id}`,
          type: "auto_follow_up",
          created_at: event.created_at,
          follow_up_event_id: event.id,
          title,
          description: event.details ? JSON.stringify(event.details) : "Follow-up action",
          meta: {
            event_type: eventType,
            follow_up_event_id: event.id,
            details: event.details,
            contact_id: event.contact_id,
          },
        });
      }
    }
  }

  // 2c) Routing events
  if (filter !== "replies" && filter !== "auto_follow_ups") {
    let routingQuery = supabase
      .from("routing_events")
      .select("id, type, details, created_at, campaign_id, contact_id")
      .eq("campaign_id", campaignId)
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false });

    if (cursor) {
      routingQuery = routingQuery.lt("created_at", cursor);
    }

    if (filter === "hot_warm") {
      routingQuery = routingQuery.in("type", ["hot_alert", "warm_alert"]);
    }

    const { data: routingEvents } = await routingQuery.limit(limit * 2);

    if (routingEvents) {
      for (const event of routingEvents) {
        let title = "Routing event";
        const eventType = event.type as string;

        if (eventType === "hot_alert") {
          title = "Marked as HOT lead + owner alerted";
        } else if (eventType === "warm_alert") {
          title = "Marked as Warm lead + owner alerted";
        } else if (eventType === "manual_stage") {
          title = "Pipeline stage updated";
        } else if (eventType === "priority_set") {
          title = "Priority set";
        } else if (eventType === "follow_up_stopped") {
          title = "Follow-ups stopped";
        }

        events.push({
          id: `routing-${event.id}`,
          type: "routing",
          created_at: event.created_at,
          routing_event_id: event.id,
          title,
          description: event.details ? JSON.stringify(event.details) : "Routing action",
          meta: {
            routing_event_id: event.id,
            type: eventType,
            details: event.details,
            contact_id: event.contact_id,
          },
        });
      }
    }
  }

  // 2d) SMS logs
  if (filter !== "replies" && filter !== "auto_follow_ups") {
    let smsQuery = supabase
      .from("sms_logs")
      .select("id, to_phone, body, status, created_at, campaign_id, contact_id")
      .eq("campaign_id", campaignId)
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false });

    if (cursor) {
      smsQuery = smsQuery.lt("created_at", cursor);
    }

    const { data: smsLogs } = await smsQuery.limit(limit * 2);

    if (smsLogs) {
      for (const log of smsLogs) {
        const truncatedBody = log.body
          ? log.body.length > 100
            ? log.body.substring(0, 100) + "..."
            : log.body
          : "SMS alert";

        events.push({
          id: `sms-${log.id}`,
          type: "sms_notification",
          created_at: log.created_at,
          sms_log_id: log.id,
          title: "SMS alert sent to owner",
          description: truncatedBody,
          meta: {
            to_phone: log.to_phone,
            status: log.status,
            sms_log_id: log.id,
            contact_id: log.contact_id,
          },
        });
      }
    }
  }

  // Step 3: Sort all events by created_at descending
  events.sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return tb - ta; // Descending
  });

  // Step 4: Apply limit and pagination
  const limitedEvents = events.slice(0, limit);
  const hasMore = events.length > limit;
  const nextCursor = hasMore && limitedEvents.length > 0
    ? limitedEvents[limitedEvents.length - 1].created_at
    : null;

  return NextResponse.json({
    events: limitedEvents,
    has_more: hasMore,
    next_cursor: nextCursor,
  });
}

