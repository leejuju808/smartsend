"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Mail, Reply, MailOpen, MousePointerClick, AlertCircle } from "lucide-react";

interface EmailsTabProps {
  events: Array<{
    id: string;
    event_type: string;
    direction?: string;
    subject?: string;
    body_text?: string;
    created_at: string;
    provider_message_id?: string;
    campaign_id?: string;
    step_id?: string;
  }>;
}

export default function EmailsTab({ events }: EmailsTabProps) {
  const getEventIcon = (eventType: string, direction?: string) => {
    if (direction === "inbound" || eventType === "reply" || eventType === "replied") {
      return <Reply className="w-4 h-4 text-orange-500" />;
    }
    switch (eventType) {
      case "sent":
      case "delivered":
        return <Mail className="w-4 h-4 text-blue-500" />;
      case "open":
      case "opened":
        return <MailOpen className="w-4 h-4 text-green-500" />;
      case "click":
      case "clicked":
        return <MousePointerClick className="w-4 h-4 text-purple-500" />;
      case "bounce":
      case "bounced":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Mail className="w-4 h-4 text-gray-500" />;
    }
  };

  const getEventBadge = (eventType: string, direction?: string) => {
    if (direction === "inbound" || eventType === "reply" || eventType === "replied") {
      return <Badge variant="default">Inbound</Badge>;
    }
    return <Badge variant="secondary">Outbound</Badge>;
  };

  if (events.length === 0) {
    return (
      <div className="mt-4 p-8 text-center text-muted-foreground">
        <p>No email events yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {events.map((event) => (
        <Card key={event.id} className="p-4">
          <div className="flex items-start gap-4">
            <div className="mt-1">{getEventIcon(event.event_type, event.direction)}</div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium capitalize">
                    {event.event_type.replace("_", " ")}
                  </span>
                  {getEventBadge(event.event_type, event.direction)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(event.created_at), "MMM d, yyyy h:mm a")}
                </p>
              </div>
              {event.subject && (
                <p className="text-sm font-medium mb-1">{event.subject}</p>
              )}
              {event.body_text && (
                <p className="text-xs text-muted-foreground line-clamp-3">
                  {event.body_text}
                </p>
              )}
              {event.provider_message_id && (
                <p className="text-xs text-muted-foreground mt-2">
                  Message ID: {event.provider_message_id}
                </p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}



