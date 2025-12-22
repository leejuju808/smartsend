"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { renderMentions } from "@/lib/notes/utils";

type TimelineItem = {
  id: string;
  type: "note" | "task" | "event" | "reply";
  created_at: string;
  data: any;
};

export function ThreadTimeline({ threadId }: { threadId: string }) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (threadId) {
      loadTimeline();
    }
  }, [threadId]);

  const loadTimeline = async () => {
    try {
      const workspaceId = localStorage.getItem("active_wid") || 
        new URLSearchParams(window.location.search).get("wid");
      
      const res = await fetch(`/api/notes/timeline/${threadId}?wid=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setTimeline(data.timeline || []);
      }
    } catch (error) {
      console.error("Error loading timeline:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  };

  const renderTimelineItem = (item: TimelineItem) => {
    const dateLabel = formatDateTime(item.created_at);

    switch (item.type) {
      case "note":
        return (
          <div key={item.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Note
              </Badge>
              <span className="text-xs text-muted-foreground">{dateLabel}</span>
            </div>
            <p className="text-sm">
              <span className="font-medium">{item.data.user}</span> added a note:{" "}
              <span
                dangerouslySetInnerHTML={{
                  __html: renderMentions(item.data.body.slice(0, 100)),
                }}
              />
            </p>
          </div>
        );

      case "task":
        return (
          <div key={item.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Task
              </Badge>
              <span className="text-xs text-muted-foreground">{dateLabel}</span>
            </div>
            <p className="text-sm">
              <span className="font-medium">{item.data.created_by}</span> created a task "
              {item.data.title}" ({item.data.status})
              {item.data.assigned_to && (
                <> assigned to {item.data.assigned_to}</>
              )}
            </p>
          </div>
        );

      case "event":
        const eventLabels: Record<string, string> = {
          assigned: "Thread assigned",
          intent_changed: "Intent changed",
          snoozed: "Thread snoozed",
          reactivated: "Thread reactivated",
          bounced: "Email bounced",
          variant_winner: "Variant winner chosen",
          auto_followup_added: "Auto-followup added",
        };
        return (
          <div key={item.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                System
              </Badge>
              <span className="text-xs text-muted-foreground">{dateLabel}</span>
            </div>
            <p className="text-sm">
              {eventLabels[item.data.event_type] || item.data.event_type}
              {item.data.metadata && Object.keys(item.data.metadata).length > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  ({JSON.stringify(item.data.metadata)})
                </span>
              )}
            </p>
          </div>
        );

      case "reply":
        return (
          <div key={item.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {item.data.direction === "inbound" ? "Reply" : "Sent"}
              </Badge>
              <span className="text-xs text-muted-foreground">{dateLabel}</span>
            </div>
            <p className="text-sm">
              {item.data.direction === "inbound" ? "Lead" : "You"} replied:{" "}
              {item.data.snippet || item.data.sender_email}
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  // Group timeline items by date
  const groupedTimeline = timeline.reduce((acc, item) => {
    const dateLabel = formatDateTime(item.created_at);
    if (!acc[dateLabel]) {
      acc[dateLabel] = [];
    }
    acc[dateLabel].push(item);
    return acc;
  }, {} as Record<string, TimelineItem[]>);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading timeline...</div>;
  }

  if (timeline.length === 0) {
    return <p className="text-sm text-muted-foreground">No timeline events yet.</p>;
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">Timeline</h3>
      <div className="space-y-4">
        {Object.entries(groupedTimeline).map(([dateLabel, items]) => (
          <div key={dateLabel} className="space-y-3">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-sm">{dateLabel}</h4>
              <div className="flex-1 border-t border-border"></div>
            </div>
            <Card className="p-3">
              <CardContent className="p-0 space-y-3">
                {items.map((item) => renderTimelineItem(item))}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}










