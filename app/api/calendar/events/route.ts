// Block 13300 — Calendar & Scheduling Sync v1
// Block 20800 — Roofing Calendar Sync v1 (extends with roofing events)
// GET /api/calendar/events
// Returns unified calendar events (inspections + tasks + roofing events) for the current workspace/org

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { getCurrentOrgId } from "@/lib/org-helpers";

export type CalendarEvent = {
  id: string;
  type: "inspection" | "task" | "adjuster_appt" | "install_date" | "follow_up" | "inspection_event";
  title: string;
  start: string; // ISO timestamp
  end?: string; // Optional ISO timestamp
  contactId?: string;
  taskId?: string;
  jobId?: string;
  threadId?: string;
  eventId?: string; // calendar_events.id
  assignedTo?: {
    id: string;
    name: string;
  } | null;
  status?: "open" | "completed" | "scheduled" | "cancelled" | "rescheduled";
  pipelineStage?: string | null;
  // Additional fields
  notes?: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  priority?: "low" | "normal" | "high";
  autoType?: string; // For follow-up tasks
  // Block 20800 fields
  claimNumber?: string;
  carrier?: string;
  jobValue?: number;
  metadata?: Record<string, any>;
  // Block 21320 fields
  autoScheduled?: boolean;
  autoScheduleReason?: string;
  autoScheduleTrigger?: string;
  assignedToRole?: string;
  timingReason?: string;
  conflictDetected?: boolean;
};

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    const assignedToParam = searchParams.get("assignedTo") || "all";
    const typesParam = searchParams.get("types"); // comma-separated: "inspection,task"
    const teamId = searchParams.get("team_id"); // Block 25220: Filter by team

    // Validate date range
    if (!startParam || !endParam) {
      return NextResponse.json(
        { error: "start and end query parameters are required (ISO timestamps)" },
        { status: 400 }
      );
    }

    const startDate = new Date(startParam);
    const endDate = new Date(endParam);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format. Use ISO timestamps." },
        { status: 400 }
      );
    }

    // Get workspace and org IDs
    const workspaceId = await getCurrentWorkspaceId();
    const orgId = await getCurrentOrgId();

    if (!workspaceId && !orgId) {
      return NextResponse.json(
        { error: "Workspace or organization not found" },
        { status: 404 }
      );
    }

    // Parse types filter
    const types = typesParam ? typesParam.split(",") : ["inspection", "task", "adjuster_appt", "install_date", "follow_up"];
    const includeInspections = types.includes("inspection");
    const includeTasks = types.includes("task");
    const includeRoofingEvents = types.some(t => ["adjuster_appt", "install_date", "follow_up", "inspection_event"].includes(t));

    // Block 25220: Get team calendar filter if team_id is specified
    let teamEventTypes: string[] | null = null;
    let teamMemberIds: string[] | null = null;
    if (teamId) {
      const { data: teamFilter } = await supabase
        .from("team_calendar_filters")
        .select("event_types")
        .eq("team_id", teamId)
        .single();

      if (teamFilter && teamFilter.event_types && teamFilter.event_types.length > 0) {
        // If team has specific event types, use those
        if (teamFilter.event_types.includes("*")) {
          // "*" means all events
          teamEventTypes = null;
        } else {
          teamEventTypes = teamFilter.event_types;
        }
      }

      // Get team members for filtering
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("is_active", true);

      if (teamMembers && teamMembers.length > 0) {
        teamMemberIds = teamMembers.map((m) => m.user_id);
      }
    }

    const events: CalendarEvent[] = [];

    // ============================================================================
    // 1. FETCH INSPECTIONS
    // ============================================================================
    if (includeInspections && workspaceId) {
      let inspectionsQuery = supabase
        .from("contacts")
        .select(`
          id,
          email,
          first_name,
          last_name,
          phone,
          company,
          inspection_at,
          inspection_assigned_to,
          inspection_notes,
          pipeline_stage
        `)
        .eq("workspace_id", workspaceId)
        .not("inspection_at", "is", null)
        .gte("inspection_at", startParam)
        .lte("inspection_at", endParam);

      // Filter by assignedTo
      if (assignedToParam === "me") {
        inspectionsQuery = inspectionsQuery.eq("inspection_assigned_to", user.id);
      } else if (assignedToParam !== "all") {
        inspectionsQuery = inspectionsQuery.eq("inspection_assigned_to", assignedToParam);
      }

      const { data: inspections, error: inspectionsError } = await inspectionsQuery;

      if (inspectionsError) {
        console.error("[Calendar] Inspections error:", inspectionsError);
      } else if (inspections) {
        // Get assigned user names
        const assignedUserIds = [...new Set(
          inspections
            .map((i) => i.inspection_assigned_to)
            .filter((id): id is string => id !== null)
        )];

        const assignedUsersMap = new Map<string, { id: string; name: string }>();
        if (assignedUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, name")
            .in("id", assignedUserIds);

          profiles?.forEach((profile) => {
            assignedUsersMap.set(profile.id, {
              id: profile.id,
              name: profile.full_name || profile.name || "Unknown",
            });
          });
        }

        // Transform inspections to calendar events
        inspections.forEach((inspection) => {
          const contactName = inspection.first_name || inspection.last_name
            ? `${inspection.first_name || ""} ${inspection.last_name || ""}`.trim()
            : inspection.email || "Unknown";

          events.push({
            id: `inspection-${inspection.id}`,
            type: "inspection",
            title: `Inspection — ${contactName}`,
            start: inspection.inspection_at,
            end: inspection.inspection_at
              ? new Date(
                  new Date(inspection.inspection_at).getTime() + 60 * 60 * 1000
                ).toISOString() // Default 1 hour duration
              : undefined,
            contactId: inspection.id,
            assignedTo: inspection.inspection_assigned_to
              ? assignedUsersMap.get(inspection.inspection_assigned_to) || {
                  id: inspection.inspection_assigned_to,
                  name: "Unknown",
                }
              : null,
            status: "open",
            pipelineStage: inspection.pipeline_stage || null,
            notes: inspection.inspection_notes || undefined,
            phone: inspection.phone || undefined,
            email: inspection.email || undefined,
            contactName,
          });
        });
      }
    }

    // ============================================================================
    // 2. FETCH TASKS
    // ============================================================================
    if (includeTasks && orgId) {
      let tasksQuery = supabase
        .from("tasks")
        .select(`
          id,
          title,
          notes,
          due_at,
          due_date,
          assigned_to,
          status,
          completed,
          priority,
          auto_type,
          contact_id
        `)
        .eq("org_id", orgId)
        .not("due_at", "is", null)
        .gte("due_at", startParam)
        .lte("due_at", endParam);

      // Filter by assignedTo
      if (assignedToParam === "me") {
        tasksQuery = tasksQuery.eq("assigned_to", user.id);
      } else if (assignedToParam !== "all") {
        tasksQuery = tasksQuery.eq("assigned_to", assignedToParam);
      }

      // Block 25220: Filter by team if specified
      if (teamId) {
        // First try filtering by assigned_team_id if column exists
        tasksQuery = tasksQuery.eq("assigned_team_id", teamId);
        
        // If no results or column doesn't exist, fall back to team members
        if (teamMemberIds && teamMemberIds.length > 0) {
          // This will be handled in post-processing if assigned_team_id doesn't work
        } else if (!teamMemberIds || teamMemberIds.length === 0) {
          // No team members, skip tasks
          tasksQuery = tasksQuery.eq("id", "00000000-0000-0000-0000-000000000000"); // Force empty result
        }
      }

      // Only show open tasks by default (or if status filter is applied)
      const statusFilter = searchParams.get("status");
      if (!statusFilter || statusFilter === "open") {
        tasksQuery = tasksQuery.eq("completed", false).eq("status", "open");
      }

      const { data: tasks, error: tasksError } = await tasksQuery;

      if (tasksError) {
        console.error("[Calendar] Tasks error:", tasksError);
      } else if (tasks) {
        // Get assigned user names
        const assignedUserIds = [...new Set(
          tasks
            .map((t) => t.assigned_to)
            .filter((id): id is string => id !== null)
        )];

        const assignedUsersMap = new Map<string, { id: string; name: string }>();
        if (assignedUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, name")
            .in("id", assignedUserIds);

          profiles?.forEach((profile) => {
            assignedUsersMap.set(profile.id, {
              id: profile.id,
              name: profile.full_name || profile.name || "Unknown",
            });
          });
        }

        // Get contact info for tasks with contact_id
        const contactIds = [...new Set(
          tasks
            .map((t) => t.contact_id)
            .filter((id): id is string => id !== null)
        )];

        const contactsMap = new Map<string, { name: string; email?: string; phone?: string }>();
        if (contactIds.length > 0 && workspaceId) {
          const { data: contacts } = await supabase
            .from("contacts")
            .select("id, email, first_name, last_name, phone")
            .eq("workspace_id", workspaceId)
            .in("id", contactIds);

          contacts?.forEach((contact) => {
            const name = contact.first_name || contact.last_name
              ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
              : contact.email || "Unknown";
            contactsMap.set(contact.id, {
              name,
              email: contact.email || undefined,
              phone: contact.phone || undefined,
            });
          });
        }

        // Transform tasks to calendar events
        tasks.forEach((task) => {
          const contactInfo = task.contact_id ? contactsMap.get(task.contact_id) : null;
          const title = contactInfo
            ? `${task.title} — ${contactInfo.name}`
            : task.title;

          events.push({
            id: `task-${task.id}`,
            type: "task",
            title,
            start: task.due_at,
            end: task.due_at
              ? new Date(
                  new Date(task.due_at).getTime() + 30 * 60 * 1000
                ).toISOString() // Default 30 min duration
              : undefined,
            taskId: task.id,
            contactId: task.contact_id || undefined,
            assignedTo: task.assigned_to
              ? assignedUsersMap.get(task.assigned_to) || {
                  id: task.assigned_to,
                  name: "Unknown",
                }
              : null,
            status: task.status || (task.completed ? "completed" : "open"),
            notes: task.notes || undefined,
            priority: task.priority || "normal",
            autoType: task.auto_type || undefined,
            contactName: contactInfo?.name,
            email: contactInfo?.email,
            phone: contactInfo?.phone,
          });
        });
      }
    }

    // ============================================================================
    // 3. FETCH ROOFING CALENDAR EVENTS (Block 20800)
    // ============================================================================
    if (includeRoofingEvents && workspaceId) {
      // Convert ISO timestamps to date strings for calendar_events query
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      let roofingEventsQuery = supabase
        .from("calendar_events")
        .select(`
          id,
          job_id,
          thread_id,
          lead_id,
          contact_id,
          event_type,
          title,
          description,
          event_date,
          event_start_time,
          event_end_time,
          status,
          created_by,
          metadata,
          auto_scheduled,
          auto_schedule_reason,
          auto_schedule_trigger,
          assigned_to_role,
          timing_reason,
          conflict_detected
        `)
        .eq("workspace_id", workspaceId)
        .eq("status", "scheduled")
        .gte("event_date", startDateStr)
        .lte("event_date", endDateStr);

      // Filter by event types if specified
      if (typesParam) {
        const roofingTypeMap: Record<string, string> = {
          "adjuster_appt": "ADJUSTER_APPT",
          "install_date": "INSTALL_DATE",
          "follow_up": "FOLLOW_UP",
          "inspection_event": "INSPECTION"
        };
        const roofingTypes = types
          .filter(t => roofingTypeMap[t])
          .map(t => roofingTypeMap[t]);
        if (roofingTypes.length > 0) {
          roofingEventsQuery = roofingEventsQuery.in("event_type", roofingTypes);
        }
      }

      const { data: roofingEvents, error: roofingEventsError } = await roofingEventsQuery;

      if (roofingEventsError) {
        console.error("[Calendar] Roofing events error:", roofingEventsError);
      } else if (roofingEvents) {
        // Get thread and contact info for enrichment
        const threadIds = [...new Set(
          roofingEvents
            .map((e) => e.thread_id)
            .filter((id): id is string => id !== null)
        )];

        const threadsMap = new Map<string, any>();
        if (threadIds.length > 0) {
          const { data: threads } = await supabase
            .from("inbox_threads")
            .select("id, contact_id, insurance_claim_number, insurance_carrier")
            .in("id", threadIds);

          threads?.forEach((thread) => {
            threadsMap.set(thread.id, thread);
          });
        }

        const contactIds = [...new Set(
          roofingEvents
            .map((e) => e.contact_id)
            .filter((id): id is string => id !== null)
            .concat(
              threads
                ?.map((t) => t.contact_id)
                .filter((id): id is string => id !== null) || []
            )
        )];

        const contactsMap = new Map<string, { name: string; email?: string; phone?: string }>();
        if (contactIds.length > 0) {
          const { data: contacts } = await supabase
            .from("contacts")
            .select("id, email, first_name, last_name, phone")
            .eq("workspace_id", workspaceId)
            .in("id", contactIds);

          contacts?.forEach((contact) => {
            const name = contact.first_name || contact.last_name
              ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
              : contact.email || "Unknown";
            contactsMap.set(contact.id, {
              name,
              email: contact.email || undefined,
              phone: contact.phone || undefined,
            });
          });
        }

        // Transform roofing events to calendar events
        roofingEvents.forEach((event) => {
          const thread = event.thread_id ? threadsMap.get(event.thread_id) : null;
          const contactId = event.contact_id || thread?.contact_id;
          const contact = contactId ? contactsMap.get(contactId) : null;

          // Build ISO timestamp from date + time
          const eventDate = new Date(event.event_date);
          let startTimestamp = eventDate.toISOString();
          if (event.event_start_time) {
            const [hours, minutes] = event.event_start_time.split(':');
            eventDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            startTimestamp = eventDate.toISOString();
          }

          let endTimestamp: string | undefined;
          if (event.event_end_time) {
            const [hours, minutes] = event.event_end_time.split(':');
            const endDate = new Date(event.event_date);
            endDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            endTimestamp = endDate.toISOString();
          } else if (event.event_start_time) {
            // Default duration: 1 hour for appointments, 30 min for follow-ups
            const duration = event.event_type === 'ADJUSTER_APPT' ? 60 : 30;
            endTimestamp = new Date(eventDate.getTime() + duration * 60 * 1000).toISOString();
          }

          // Map event_type to type
          const typeMap: Record<string, string> = {
            "ADJUSTER_APPT": "adjuster_appt",
            "INSTALL_DATE": "install_date",
            "FOLLOW_UP": "follow_up",
            "INSPECTION": "inspection_event"
          };

          events.push({
            id: `roofing-${event.id}`,
            type: (typeMap[event.event_type] || "follow_up") as any,
            title: event.title,
            description: event.description || undefined,
            start: startTimestamp,
            end: endTimestamp,
            eventId: event.id,
            jobId: event.job_id || undefined,
            threadId: event.thread_id || undefined,
            contactId: contactId || undefined,
            status: event.status === "scheduled" ? "open" : event.status === "completed" ? "completed" : "open",
            notes: event.description || undefined,
            contactName: contact?.name,
            email: contact?.email,
            phone: contact?.phone,
            claimNumber: event.metadata?.claim_number || thread?.insurance_claim_number || undefined,
            carrier: event.metadata?.carrier || thread?.insurance_carrier || undefined,
            jobValue: event.metadata?.job_value || undefined,
            metadata: event.metadata || {},
            // Block 21320: Auto-scheduling fields
            autoScheduled: event.auto_scheduled || false,
            autoScheduleReason: event.auto_schedule_reason || undefined,
            autoScheduleTrigger: event.auto_schedule_trigger || undefined,
            assignedToRole: event.assigned_to_role || undefined,
            timingReason: event.timing_reason || undefined,
            conflictDetected: event.conflict_detected || false,
          });
        });
      }
    }

    // Sort events by start time
    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return NextResponse.json({
      events,
      count: events.length,
    });
  } catch (error: any) {
    console.error("[Calendar] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}












