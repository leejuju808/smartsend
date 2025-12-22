// Block 16600 — SmartSend Activity Log v2
// GET /api/activity
// Company-level activity stream (mission control feed)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current workspace
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50", 10));
    const category = searchParams.get("category");
    const type = searchParams.get("type");
    const severity = searchParams.get("severity");
    const contactId = searchParams.get("contact_id");
    const pipelineStage = searchParams.get("pipeline_stage");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    // Build query
    let query = supabase
      .from("activity_logs_v2")
      .select(`
        *,
        contact:contact_id (
          id,
          email,
          first_name,
          last_name
        ),
        user:user_id (
          id,
          email,
          raw_user_meta_data
        )
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // Get one extra to check if there's more

    // Apply filters
    if (category) {
      query = query.eq("category", category);
    }
    
    if (type) {
      query = query.eq("type", type);
    }
    
    if (severity) {
      query = query.eq("severity", severity);
    }
    
    if (contactId) {
      query = query.eq("contact_id", contactId);
    }
    
    if (pipelineStage) {
      query = query.eq("pipeline_stage_key", pipelineStage);
    }
    
    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }
    
    if (dateTo) {
      query = query.lte("created_at", dateTo);
    }

    // Cursor-based pagination
    if (cursor) {
      const [cursorTime, cursorId] = cursor.split("|");
      query = query.or(
        `created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${cursorId})`
      );
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error("Error fetching activity logs:", error);
      return NextResponse.json(
        { error: "Failed to fetch activity logs" },
        { status: 500 }
      );
    }

    // Check if there's more data
    const hasMore = logs && logs.length > limit;
    const results = hasMore ? logs.slice(0, limit) : logs || [];

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && results.length > 0) {
      const lastItem = results[results.length - 1];
      nextCursor = `${lastItem.created_at}|${lastItem.id}`;
    }

    // Group related events for smart grouping
    const grouped = groupRelatedEvents(results);

    return NextResponse.json({
      logs: grouped,
      pagination: {
        hasMore,
        nextCursor,
        limit,
      },
    });
  } catch (error) {
    console.error("Error in activity route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Group related events together for cleaner display
 * Example: "5 homeowner replies — View All"
 */
function groupRelatedEvents(logs: any[]): any[] {
  const grouped: any[] = [];
  const groups: Map<string, any[]> = new Map();

  // Group events by type and time window (within 5 minutes)
  logs.forEach((log) => {
    const key = `${log.category}_${log.type}`;
    const time = new Date(log.created_at).getTime();
    
    // Check if there's a recent group of the same type
    let foundGroup = false;
    for (const [groupKey, groupLogs] of groups.entries()) {
      if (groupKey.startsWith(key)) {
        const groupTime = new Date(groupLogs[0].created_at).getTime();
        const timeDiff = Math.abs(time - groupTime);
        
        // If within 5 minutes, add to group
        if (timeDiff < 5 * 60 * 1000) {
          groupLogs.push(log);
          foundGroup = true;
          break;
        }
      }
    }
    
    if (!foundGroup) {
      groups.set(`${key}_${time}`, [log]);
    }
  });

  // Convert groups to display format
  groups.forEach((groupLogs) => {
    if (groupLogs.length > 1) {
      // Create grouped entry
      const firstLog = groupLogs[0];
      grouped.push({
        ...firstLog,
        isGrouped: true,
        groupCount: groupLogs.length,
        groupItems: groupLogs,
        summary: `${groupLogs.length} ${getEventTypeLabel(firstLog.category, firstLog.type)}`,
      });
    } else {
      grouped.push(groupLogs[0]);
    }
  });

  return grouped.sort((a, b) => {
    const timeA = new Date(a.created_at || a.groupItems?.[0]?.created_at).getTime();
    const timeB = new Date(b.created_at || b.groupItems?.[0]?.created_at).getTime();
    return timeB - timeA;
  });
}

function getEventTypeLabel(category: string, type: string): string {
  const labels: Record<string, Record<string, string>> = {
    messaging: {
      email_sent: "emails sent",
      reply_received: "homeowner replies",
      followup_sent: "follow-ups sent",
      open_tracked: "email opens",
      link_click: "link clicks",
    },
    pipeline: {
      moved_to_warm: "leads moved to Warm",
      moved_to_hot: "leads moved to Hot",
      moved_to_appointment: "leads moved to Appointment",
    },
    scheduler: {
      appointment_booked: "appointments booked",
      appointment_confirmed: "appointments confirmed",
    },
  };

  return labels[category]?.[type] || `${category} ${type}`;
}
