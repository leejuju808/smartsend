"use client";

import { format } from "date-fns";

export interface ActivityEvent {
  id: string;
  created_at: string;
  event_type: string;
  meta?: Record<string, any>;
  campaign_id?: string | null;
  company_id?: string | null;
  lead_id?: string | null;
}

interface ActivityTimelineProps {
  events: ActivityEvent[];
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  if (!events || events.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No activity yet
      </div>
    );
  }

  const formatEventType = (eventType: string): string => {
    return eventType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getEventIcon = (eventType: string): string => {
    if (eventType.includes("sent")) return "📧";
    if (eventType.includes("open")) return "👁️";
    if (eventType.includes("click")) return "🖱️";
    if (eventType.includes("reply")) return "💬";
    if (eventType.includes("bounce")) return "⚠️";
    if (eventType.includes("unsubscribe")) return "🚫";
    if (eventType.includes("intent")) return "🎯";
    if (eventType.includes("scheduler")) return "⏰";
    if (eventType.includes("deliverability")) return "🛡️";
    if (eventType.includes("smartlist")) return "📋";
    return "📌";
  };

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex gap-3 pb-4 border-b last:border-b-0 last:pb-0"
        >
          <div className="text-2xl flex-shrink-0">{getEventIcon(event.event_type)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="font-semibold text-sm">
                  {formatEventType(event.event_type)}
                </div>
                {event.meta && Object.keys(event.meta).length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {Object.entries(event.meta)
                      .filter(([key]) => key !== "ip" && key !== "user_agent")
                      .slice(0, 3)
                      .map(([key, value]) => (
                        <span key={key} className="mr-3">
                          <strong>{key}:</strong> {String(value).slice(0, 50)}
                        </span>
                      ))}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {format(new Date(event.created_at), "MMM d, h:mm a")}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}












