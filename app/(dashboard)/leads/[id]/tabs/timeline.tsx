"use client";

import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Mail, MailOpen, MousePointerClick, Reply, AlertCircle, Settings, FileText } from "lucide-react";

interface TimelineTabProps {
  timeline: Array<{
    ts: string;
    type: string;
    subtype: string;
    data: any;
  }>;
}

export default function TimelineTab({ timeline }: TimelineTabProps) {
  const getEventIcon = (type: string, subtype: string) => {
    if (type === "email") {
      switch (subtype) {
        case "sent":
        case "delivered":
          return <Mail className="w-4 h-4 text-blue-500" />;
        case "open":
        case "opened":
          return <MailOpen className="w-4 h-4 text-green-500" />;
        case "click":
        case "clicked":
          return <MousePointerClick className="w-4 h-4 text-purple-500" />;
        case "reply":
        case "replied":
          return <Reply className="w-4 h-4 text-orange-500" />;
        case "bounce":
        case "bounced":
          return <AlertCircle className="w-4 h-4 text-red-500" />;
        default:
          return <Mail className="w-4 h-4 text-gray-500" />;
      }
    }
    if (type === "activity") {
      return <FileText className="w-4 h-4 text-blue-500" />;
    }
    if (type === "workspace") {
      return <Settings className="w-4 h-4 text-gray-500" />;
    }
    return <Settings className="w-4 h-4 text-gray-500" />;
  };

  const getEventLabel = (type: string, subtype: string, data: any) => {
    if (type === "email") {
      switch (subtype) {
        case "sent":
        case "delivered":
          return `Email sent${data?.subject ? `: ${data.subject}` : ""}`;
        case "open":
        case "opened":
          return "Email opened";
        case "click":
        case "clicked":
          return `Link clicked${data?.url ? `: ${data.url}` : ""}`;
        case "reply":
        case "replied":
          return "Replied to email";
        case "bounce":
        case "bounced":
          return "Email bounced";
        default:
          return `Email event: ${subtype}`;
      }
    }
    if (type === "activity") {
      return `${subtype || "Activity"}`;
    }
    if (type === "workspace") {
      return `${subtype || "Workspace event"}`;
    }
    return `${type}: ${subtype}`;
  };

  if (timeline.length === 0) {
    return (
      <div className="mt-4 p-8 text-center text-muted-foreground">
        <p>No timeline events yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {timeline.map((event, idx) => (
        <Card key={idx} className="p-4">
          <div className="flex items-start gap-4">
            <div className="mt-1">{getEventIcon(event.type, event.subtype)}</div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{getEventLabel(event.type, event.subtype, event.data)}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(event.ts), "MMM d, yyyy h:mm a")}
                </p>
              </div>
              {event.data?.body_text && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                  {event.data.body_text}
                </p>
              )}
              {event.data?.url && (
                <p className="text-xs text-muted-foreground mt-1">
                  <a href={event.data.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {event.data.url}
                  </a>
                </p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}



