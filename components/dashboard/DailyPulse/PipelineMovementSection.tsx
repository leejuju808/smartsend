"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface PipelineMovementSectionProps {
  events: Array<{
    id: string;
    lead_id: string;
    event_type: string;
    created_at: string;
    event_data: any;
    lead_name?: string;
  }>;
}

export function PipelineMovementSection({ events }: PipelineMovementSectionProps) {
  const formatEventType = (eventType: string) => {
    return eventType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getEventIcon = (eventType: string) => {
    if (eventType.includes("won")) return "✅";
    if (eventType.includes("lost")) return "❌";
    if (eventType.includes("reply")) return "💬";
    if (eventType.includes("proposal")) return "📄";
    if (eventType.includes("estimate")) return "📋";
    return "📝";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>📈 Pipeline Movement (Last 24 Hours)</CardTitle>
        <p className="text-sm text-muted-foreground">
          {events.length} event{events.length !== 1 ? "s" : ""} in your pipeline
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {events.slice(0, 20).map((event) => (
            <div
              key={event.id}
              className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 transition-colors"
            >
              <span className="text-lg">{getEventIcon(event.event_type)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {event.lead_name || "Unknown Lead"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatEventType(event.event_type)}
                </div>
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(event.created_at).toLocaleTimeString()}
              </div>
            </div>
          ))}
          {events.length > 20 && (
            <div className="text-sm text-muted-foreground text-center pt-2">
              +{events.length - 20} more events
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}









































