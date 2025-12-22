import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/owner/activity
 * Fetch recent activity feed (last 24 hours)
 * Includes inbox_actions and system events (new hot leads)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") || "all"; // all, hot_leads, booked, calls, tasks
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    // Calculate date 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    const twentyFourHoursAgoISO = twentyFourHoursAgo.toISOString();

    // Get user's accessible campaigns
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    let campaignIds: string[] = [];

    if (membership?.workspace_id) {
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("workspace_id", membership.workspace_id);
      campaignIds = campaigns?.map((c) => c.id) || [];
    } else {
      // Fallback: user-owned campaigns
      const { data: userCampaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("user_id", user.id);
      campaignIds = userCampaigns?.map((c) => c.id) || [];
    }

    if (campaignIds.length === 0) {
      return NextResponse.json({ activities: [] });
    }

    const activities: any[] = [];

    // 1. Fetch inbox_actions from last 24 hours
    // First, get thread IDs that belong to accessible campaigns
    const { data: accessibleThreads } = await supabase
      .from("inbox_threads")
      .select("id, contact_id, campaign_id")
      .in("campaign_id", campaignIds);

    if (!accessibleThreads || accessibleThreads.length === 0) {
      return NextResponse.json({ activities: [] });
    }

    const threadIds = accessibleThreads.map((t) => t.id);
    const threadMap = new Map(accessibleThreads.map((t) => [t.id, t]));

    // Get contact IDs
    const contactIds = accessibleThreads
      .map((t) => t.contact_id)
      .filter((id): id is string => id !== null);

    // Fetch contacts
    const contactMap = new Map<string, any>();
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email")
        .in("id", contactIds);

      if (contacts) {
        contacts.forEach((c) => contactMap.set(c.id, c));
      }
    }

    // Now fetch actions
    let actionsQuery = supabase
      .from("inbox_actions")
      .select("id, thread_id, action_type, created_at, metadata")
      .in("thread_id", threadIds)
      .gte("created_at", twentyFourHoursAgoISO)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Apply filter
    if (filter === "booked") {
      actionsQuery = actionsQuery.eq("action_type", "mark_booked");
    } else if (filter === "calls") {
      actionsQuery = actionsQuery.eq("action_type", "call_now");
    } else if (filter === "tasks") {
      actionsQuery = actionsQuery.eq("action_type", "add_task");
    } else if (filter === "hot_leads") {
      // For hot leads, we'll filter in the processing step
    }

    const { data: actions, error: actionsError } = await actionsQuery;

    if (!actionsError && actions) {
      for (const action of actions) {
        const thread = threadMap.get(action.thread_id);
        const contact = thread?.contact_id ? contactMap.get(thread.contact_id) : null;
        const contactName = contact
          ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email
          : "Unknown";

        let activityType = action.action_type;
        let icon = "📋";
        let message = "";

        switch (action.action_type) {
          case "mark_booked":
            activityType = "booked";
            icon = "💰";
            const estimatedValue = action.metadata?.estimated_value;
            const jobType = action.metadata?.job_type;
            const probability = action.metadata?.probability;
            const jobTypeLabel = jobType 
              ? jobType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
              : "";
            const valueText = estimatedValue
              ? ` — $${Number(estimatedValue).toLocaleString()}`
              : "";
            const jobTypeText = jobTypeLabel ? ` (${jobTypeLabel})` : "";
            const probText = probability ? ` — ${probability}% probability` : "";
            message = `💰 Job added to pipeline: ${contactName}${valueText}${jobTypeText}${probText}`;
            break;
          case "call_now":
            activityType = "call";
            icon = "📞";
            message = `You called ${contactName}${action.metadata?.phone ? ` (${action.metadata.phone})` : ""}.`;
            break;
          case "add_task":
            activityType = "task";
            icon = "📋";
            const taskDue = action.metadata?.due_date
              ? new Date(action.metadata.due_date).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : null;
            message = `Follow-up task created for ${contactName}${taskDue ? ` due ${taskDue}` : ""}.`;
            break;
          case "send_estimate_link":
          case "send_estimate":
            activityType = "estimate";
            icon = "📧";
            message = `Estimate link sent to ${contactName}.`;
            break;
          case "add_to_crm":
            activityType = "crm";
            icon = "⭐";
            message = `${contactName} added to CRM priority list.`;
            break;
          default:
            continue;
        }

        // Skip if filter is "hot_leads" and this isn't a hot lead event
        if (filter === "hot_leads" && activityType !== "hot_lead") {
          continue;
        }

        activities.push({
          id: `action-${action.id}`,
          type: activityType,
          icon,
          message,
          timestamp: action.created_at,
          threadId: action.thread_id,
          contactName,
        });
      }
    }

    // 2. Fetch jobs_conversions updates (won jobs, pipeline updates)
    if (filter === "all" || filter === "booked") {
      const { data: conversions } = await supabase
        .from("jobs_conversions")
        .select(`
          id,
          thread_id,
          estimated_value,
          pipeline_stage,
          job_type,
          probability,
          closed_at,
          updated_at,
          created_at
        `)
        .in("campaign_id", campaignIds)
        .gte("updated_at", twentyFourHoursAgoISO)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (conversions) {
        for (const conv of conversions) {
          const thread = threadMap.get(conv.thread_id);
          const contact = thread?.contact_id ? contactMap.get(thread.contact_id) : null;
          const contactName = contact
            ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email
            : "Unknown";

          // Only show updates (not initial creation, which is handled by actions)
          const isUpdate = new Date(conv.updated_at).getTime() > new Date(conv.created_at).getTime() + 1000;

          if (isUpdate && conv.pipeline_stage === "won" && conv.closed_at) {
            const valueText = conv.estimated_value
              ? ` — +$${Number(conv.estimated_value).toLocaleString()}`
              : "";
            activities.push({
              id: `won-${conv.id}`,
              type: "revenue",
              icon: "💵",
              message: `Job won: ${contactName}${valueText} added to booked revenue`,
              timestamp: conv.closed_at,
              threadId: conv.thread_id,
              contactName,
            });
          } else if (isUpdate && conv.pipeline_stage === "pending") {
            const valueText = conv.estimated_value
              ? ` — $${Number(conv.estimated_value).toLocaleString()}`
              : "";
            activities.push({
              id: `pipeline-${conv.id}`,
              type: "pipeline",
              icon: "📊",
              message: `Pipeline updated: ${contactName}${valueText} — ${conv.probability || 80}% probability`,
              timestamp: conv.updated_at,
              threadId: conv.thread_id,
              contactName,
            });
          }
        }
      }
    }

    // 3. Fetch system events: New hot leads (inbox_messages marked as hot in last 24h)
    if (filter === "all" || filter === "hot_leads") {
      const { data: hotMessages } = await supabase
        .from("inbox_messages")
        .select("id, thread_id, received_at, body_raw")
        .in("campaign_id", campaignIds)
        .eq("ai_intent", "hot")
        .gte("received_at", twentyFourHoursAgoISO)
        .order("received_at", { ascending: false })
        .limit(limit);

      if (hotMessages) {
        for (const message of hotMessages) {
          const thread = threadMap.get(message.thread_id);
          const contact = thread?.contact_id ? contactMap.get(thread.contact_id) : null;
          const contactName = contact
            ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email
            : "Unknown";

          // Get message preview (first 100 chars)
          const preview = message.body_raw
            ? message.body_raw.replace(/\s+/g, " ").slice(0, 100) + "..."
            : "";

          activities.push({
            id: `hot-${message.id}`,
            type: "hot_lead",
            icon: "🔥",
            message: `New HOT lead from ${contactName} — "${preview}"`,
            timestamp: message.received_at,
            threadId: message.thread_id,
            contactName,
          });
        }
      }
    }

    // Sort all activities by timestamp (newest first)
    activities.sort((a, b) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // Limit to requested number
    const limitedActivities = activities.slice(0, limit);

    return NextResponse.json({ activities: limitedActivities });
  } catch (error) {
    console.error("Error fetching activity feed:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity" },
      { status: 500 }
    );
  }
}

