"use client";

import { useEffect, useState, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { formatDistanceToNow } from "date-fns";
import { colors } from "@/app/inbox/constants/colors";

interface ActivityFeedEvent {
  id: string;
  event_type: string;
  event_text: string;
  event_payload: Record<string, any>;
  lead_id: string | null;
  job_id: string | null;
  thread_id: string | null;
  campaign_id: string | null;
  created_at: string;
  created_by: string;
  user_id: string | null;
  homeowner_name: string | null;
  job_value: number | null;
  stage: string | null;
}

interface RoofingActivityFeedProps {
  campaignId?: string;
  leadId?: string;
  jobId?: string;
  threadId?: string;
  eventTypes?: string[];
  limit?: number;
  hoursBack?: number;
  onEventClick?: (event: ActivityFeedEvent) => void;
  showFilters?: boolean;
}

// Event type to icon mapping
const getEventIcon = (eventType: string): string => {
  // 🔵 Lead Activity
  if (eventType.startsWith("new_email") || eventType.startsWith("homeowner_replied")) {
    return "📧";
  }
  if (eventType.includes("hot")) return "🔥";
  if (eventType.includes("warm")) return "🟡";
  if (eventType.includes("cold")) return "🔵";
  if (eventType.includes("clicked_proposal")) return "👆";

  // 🟢 Insurance Activity
  if (eventType.includes("claim_filed")) return "📋";
  if (eventType.includes("adjuster")) return "👔";
  if (eventType.includes("claim_approved")) return "✅";
  if (eventType.includes("claim_denied")) return "❌";
  if (eventType.includes("supplement") || eventType.includes("scope")) return "📊";

  // 🟠 Proposal & Estimate Activity
  if (eventType.includes("estimate")) return "💰";
  if (eventType.includes("proposal")) return "📄";
  if (eventType.includes("pricing_dispute")) return "💬";

  // 🟣 Adjuster Communications
  if (eventType.includes("supplement_request") || eventType.includes("adjuster_followup")) {
    return "📨";
  }

  // 🟡 CRM / Job Stage Updates
  if (eventType.startsWith("stage_")) return "🔄";

  // 🔴 High-Urgency Warnings
  if (eventType.includes("unresponsive") || eventType.includes("waiting") || eventType.includes("no_proposal")) {
    return "⚠️";
  }

  return "📌";
};

// Event type to color mapping
const getEventColor = (eventType: string): string => {
  // 🔵 Lead Activity
  if (eventType.startsWith("new_email") || eventType.startsWith("homeowner_replied") || eventType.includes("hot")) {
    return "#3B82F6"; // Blue
  }

  // 🟢 Insurance Activity
  if (eventType.includes("claim") || eventType.includes("adjuster") || eventType.includes("supplement")) {
    return "#10B981"; // Green
  }

  // 🟠 Proposal & Estimate Activity
  if (eventType.includes("estimate") || eventType.includes("proposal") || eventType.includes("pricing")) {
    return "#F59E0B"; // Orange
  }

  // 🟣 Adjuster Communications
  if (eventType.includes("supplement_request") || eventType.includes("adjuster_followup") || eventType.includes("adjuster_replied")) {
    return "#8B5CF6"; // Purple
  }

  // 🟡 CRM / Job Stage Updates
  if (eventType.startsWith("stage_")) {
    return "#F59E0B"; // Amber
  }

  // 🔴 High-Urgency Warnings
  if (eventType.includes("unresponsive") || eventType.includes("waiting") || eventType.includes("no_proposal")) {
    return "#EF4444"; // Red
  }

  return colors.inkSecondary;
};

export function RoofingActivityFeed({
  campaignId,
  leadId,
  jobId,
  threadId,
  eventTypes,
  limit = 50,
  hoursBack = 24,
  onEventClick,
  showFilters = true,
}: RoofingActivityFeedProps) {
  const [events, setEvents] = useState<ActivityFeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const supabase = createClientComponentClient();

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: limit.toString(),
        hours_back: hoursBack.toString(),
      });

      if (campaignId) params.append("campaign_id", campaignId);
      if (leadId) params.append("lead_id", leadId);
      if (jobId) params.append("job_id", jobId);
      if (threadId) params.append("thread_id", threadId);
      if (eventTypes && eventTypes.length > 0) {
        params.append("event_types", eventTypes.join(","));
      }

      const response = await fetch(`/api/inbox/activity-feed?${params}`);
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events || []);
      }
    } catch (error) {
      console.error("Error fetching activity feed:", error);
    } finally {
      setLoading(false);
    }
  }, [campaignId, leadId, jobId, threadId, eventTypes, limit, hoursBack]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Real-time subscription for new events
  useEffect(() => {
    const channel = supabase
      .channel("roofing-activity-feed-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_feed_events",
        },
        () => {
          // Refresh events when new event is created
          fetchEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchEvents]);

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return "Just now";
    }
  };

  const handleEventClick = (event: ActivityFeedEvent) => {
    if (onEventClick) {
      onEventClick(event);
    }
  };

  const filteredEvents = filter === "all" 
    ? events 
    : events.filter((e) => {
        if (filter === "urgent") {
          return e.event_type.includes("unresponsive") || 
                 e.event_type.includes("waiting") || 
                 e.event_type.includes("no_proposal");
        }
        if (filter === "insurance") {
          return e.event_type.includes("claim") || 
                 e.event_type.includes("adjuster") || 
                 e.event_type.includes("supplement");
        }
        if (filter === "proposals") {
          return e.event_type.includes("proposal") || 
                 e.event_type.includes("estimate");
        }
        if (filter === "stages") {
          return e.event_type.startsWith("stage_");
        }
        return true;
      });

  return (
    <div
      className="flex flex-col h-full border-l"
      style={{
        backgroundColor: colors.white,
        borderColor: colors.divider,
      }}
    >
      {/* Header */}
      <div
        className="p-4 border-b"
        style={{ borderColor: colors.divider }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-lg font-semibold"
            style={{ color: colors.ink }}
          >
            SmartSend Activity Feed
          </h2>
          <span
            className="text-xs"
            style={{ color: colors.inkSecondary }}
          >
            Last {hoursBack}h
          </span>
        </div>

        {/* Filter Dropdown */}
        {showFilters && (
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full text-xs rounded-lg px-3 py-2 transition-all"
            style={{
              border: `1px solid ${colors.divider}`,
              backgroundColor: colors.white,
              color: colors.ink,
            }}
          >
            <option value="all">All Activity</option>
            <option value="urgent">⚠️ Urgent</option>
            <option value="insurance">🟢 Insurance</option>
            <option value="proposals">🟠 Proposals</option>
            <option value="stages">🟡 Stages</option>
          </select>
        )}
      </div>

      {/* Activity List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-8 text-center">
            <p style={{ color: colors.inkSecondary }} className="text-sm">
              No activity in the last {hoursBack} hours
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: colors.divider }}>
            {filteredEvents.map((event, index) => {
              const icon = getEventIcon(event.event_type);
              const eventColor = getEventColor(event.event_type);
              const isUrgent = event.event_type.includes("unresponsive") || 
                              event.event_type.includes("waiting") || 
                              event.event_type.includes("no_proposal");

              return (
                <button
                  key={event.id}
                  onClick={() => handleEventClick(event)}
                  className="w-full text-left p-4 transition-all duration-150 hover:bg-opacity-50"
                  style={{
                    backgroundColor: isUrgent ? "#FEF2F2" : "transparent",
                    animation: `slideIn 150ms ease-out ${index * 20}ms both`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isUrgent 
                      ? "#FEE2E2" 
                      : `${colors.panelBg}80`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isUrgent 
                      ? "#FEF2F2" 
                      : "transparent";
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon in colored circle */}
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-base"
                      style={{
                        backgroundColor: `${eventColor}20`,
                        color: eventColor,
                      }}
                    >
                      {icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-semibold line-clamp-2 mb-1"
                        style={{ color: colors.ink }}
                      >
                        {event.event_text}
                      </p>
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        {event.homeowner_name && (
                          <p
                            className="text-xs"
                            style={{ color: colors.inkSecondary }}
                          >
                            {event.homeowner_name}
                            {event.job_value && ` · $${event.job_value.toLocaleString()}`}
                          </p>
                        )}
                        <span
                          className="text-xs ml-auto whitespace-nowrap"
                          style={{ color: colors.neutral }}
                        >
                          {formatTimestamp(event.created_at)}
                        </span>
                      </div>
                      {event.stage && (
                        <div className="mt-1">
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: `${eventColor}20`,
                              color: eventColor,
                            }}
                          >
                            {event.stage.replace(/_/g, " ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
















































