import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type TimelineEventType =
  | "email_outbound"
  | "email_inbound"
  | "auto_follow_up"
  | "routing"
  | "sms_notification"
  | "status_change"
  | "pipeline_change";

export type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  created_at: string;
  // references
  message_id?: string;
  follow_up_event_id?: string;
  routing_event_id?: string;
  sms_log_id?: string;
  // display fields
  title: string;
  description: string;
  meta?: Record<string, any>;
};

/**
 * GET /api/leads/:leadId/timeline?campaignId=...&limit=50&cursor=...
 * 
 * Returns a unified timeline of all events for a lead:
 * - Outbound emails
 * - Inbound emails (with intent)
 * - Auto follow-up events
 * - Routing events (hot/warm alerts)
 * - SMS notifications
 * - Status/pipeline changes
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const supabase = createClient();
  const { leadId } = await params;
  const { searchParams } = new URL(req.url);

  // Get current user for auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const campaignId = searchParams.get("campaignId");
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "50"));
  const cursor = searchParams.get("cursor"); // ISO timestamp for pagination

  // Step 1: Resolve contact_id from lead_id
  // First, get the lead to find email
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, email, workspace_id, account_id")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Find contact_id by matching email
  // Try to find contact by email matching lead email
  let contactId: string | null = null;

  // Check if lead has contact_id directly
  const leadWithContact = await supabase
    .from("leads")
    .select("contact_id")
    .eq("id", leadId)
    .single();

  if (leadWithContact.data?.contact_id) {
    contactId = leadWithContact.data.contact_id;
  } else if (lead.email) {
    // Find contact by email match
    const accountId = lead.account_id || user.id;
    const workspaceId = lead.workspace_id;

    // Try to find contact by email
    let contactQuery = supabase
      .from("contacts")
      .select("id")
      .ilike("email", lead.email)
      .limit(1);

    // Filter by account_id or workspace_id if available
    if (accountId) {
      contactQuery = contactQuery.or(`account_id.eq.${accountId},workspace_id.eq.${workspaceId}`);
    } else if (workspaceId) {
      contactQuery = contactQuery.eq("workspace_id", workspaceId);
    }

    const { data: contact } = await contactQuery.maybeSingle();
    contactId = contact?.id || null;
  }

  if (!contactId) {
    // If no contact found, return empty timeline
    // This can happen if the lead hasn't been linked to a contact yet
    return NextResponse.json({
      events: [],
      has_more: false,
      next_cursor: null,
    });
  }

  // Step 2: Fetch events from each table
  const events: TimelineEvent[] = [];

  // 2a) Messages (emails)
  let messagesQuery = supabase
    .from("messages")
    .select("id, direction, subject, created_at, intent, reply_summary, reply_next_action, campaign_id")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });

  if (campaignId) {
    messagesQuery = messagesQuery.eq("campaign_id", campaignId);
  }

  if (cursor) {
    messagesQuery = messagesQuery.lt("created_at", cursor);
  }

  const { data: messages } = await messagesQuery.limit(limit * 2); // Get more to account for other event types

  if (messages) {
    for (const msg of messages) {
      const direction = (msg.direction || "").toLowerCase();
      const isOutbound = direction === "outbound" || direction === "outgoing";
      
      if (isOutbound) {
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
          },
        });
      } else {
        // Inbound email (inbound, incoming, in, or any other value)
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
          },
        });
      }
    }
  }

  // 2b) Follow-up events
  let followUpQuery = supabase
    .from("follow_up_events")
    .select("id, event_type, details, created_at, campaign_id")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });

  if (campaignId) {
    followUpQuery = followUpQuery.eq("campaign_id", campaignId);
  }

  if (cursor) {
    followUpQuery = followUpQuery.lt("created_at", cursor);
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
        },
      });
    }
  }

  // 2c) Routing events
  let routingQuery = supabase
    .from("routing_events")
    .select("id, type, details, created_at, campaign_id")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });

  if (campaignId) {
    routingQuery = routingQuery.eq("campaign_id", campaignId);
  }

  if (cursor) {
    routingQuery = routingQuery.lt("created_at", cursor);
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
        },
      });
    }
  }

  // 2d) SMS logs
  let smsQuery = supabase
    .from("sms_logs")
    .select("id, to_phone, body, status, created_at, campaign_id")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });

  if (campaignId) {
    smsQuery = smsQuery.eq("campaign_id", campaignId);
  }

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
        },
      });
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
