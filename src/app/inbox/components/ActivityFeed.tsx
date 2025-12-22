"use client";

import { useEffect, useState, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { formatDistanceToNow } from "date-fns";
import { colors } from "../constants/colors";
import { EmptyActivityState } from "./EmptyStates";

interface ActivityItem {
  id: string;
  type: string;
  icon: string;
  message: string;
  timestamp: string;
  threadId: string;
  contactName: string;
}

type ActivityFilter = "all" | "hot_leads" | "booked" | "calls" | "tasks";

interface ActivityFeedProps {
  onThreadSelect?: (threadId: string) => void;
}

export function ActivityFeed({ onThreadSelect }: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const supabase = createClientComponentClient();

  const fetchActivities = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        filter,
        limit: "20",
      });
      const response = await fetch(`/api/inbox/owner/activity?${params}`);
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Real-time subscription for new activities
  useEffect(() => {
    const channel = supabase
      .channel("inbox-activity-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inbox_actions",
        },
        () => {
          // Refresh activities when new action is created
          fetchActivities();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inbox_messages",
        },
        (payload) => {
          // Refresh if it's a hot lead
          const newMessage = payload.new as any;
          if (newMessage.ai_intent === "hot") {
            fetchActivities();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchActivities]);

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < 24) {
        return formatDistanceToNow(date, { addSuffix: true });
      } else if (diffHours < 48) {
        return "Yesterday";
      } else {
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      }
    } catch {
      return "Just now";
    }
  };

  const handleActivityClick = (threadId: string) => {
    if (onThreadSelect) {
      onThreadSelect(threadId);
    }
  };

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
            Activity
          </h2>
          <span
            className="text-xs"
            style={{ color: colors.inkSecondary }}
          >
            Last 24h
          </span>
        </div>

        {/* Filter Dropdown */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as ActivityFilter)}
          className="w-full text-xs rounded-lg px-3 py-2 transition-all"
          style={{
            border: `1px solid ${colors.divider}`,
            backgroundColor: colors.white,
            color: colors.ink,
          }}
        >
          <option value="all">All</option>
          <option value="hot_leads">Hot Leads</option>
          <option value="booked">Booked</option>
          <option value="calls">Calls</option>
          <option value="tasks">Tasks</option>
        </select>
      </div>

      {/* Activity List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : activities.length === 0 ? (
          <EmptyActivityState />
        ) : (
          <div className="divide-y" style={{ borderColor: colors.divider }}>
            {activities.map((activity, index) => (
              <button
                key={activity.id}
                onClick={() => handleActivityClick(activity.threadId)}
                className="w-full text-left p-4 transition-all duration-150 hover:bg-opacity-50"
                style={{
                  backgroundColor: "transparent",
                  animation: `slideIn 150ms ease-out ${index * 20}ms both`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `${colors.panelBg}80`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Icon in colored circle */}
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-base"
                    style={{
                      backgroundColor: colors.primaryLight,
                      color: colors.primary,
                    }}
                  >
                    {activity.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold line-clamp-2 mb-1"
                      style={{ color: colors.ink }}
                    >
                      {activity.message}
                    </p>
                    <div className="flex items-center justify-between">
                      <p
                        className="text-xs"
                        style={{ color: colors.inkSecondary }}
                      >
                        {activity.contactName}
                      </p>
                      <span
                        className="text-xs ml-2 whitespace-nowrap"
                        style={{ color: colors.neutral }}
                      >
                        {formatTimestamp(activity.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

