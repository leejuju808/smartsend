"use client";

import { MessageSquare, Eye, MousePointerClick, CheckSquare, FileText, Mail, Calendar, Sparkles } from "lucide-react";

// Simple date formatting fallback if date-fns is not available
function formatDistanceToNow(date: Date | string): string {
  try {
    // Try to use date-fns if available
    const { formatDistanceToNow: fn } = require("date-fns");
    return fn(new Date(date), { addSuffix: true });
  } catch {
    // Fallback to simple formatting
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    return then.toLocaleDateString();
  }
}

interface TimelineEvent {
  id: string;
  type: string;
  created_at: string;
  data: any;
}

interface LeadTimelineProps {
  events: TimelineEvent[];
}

export function LeadTimeline({ events }: LeadTimelineProps) {
  if (!events || events.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>No activity yet</p>
      </div>
    );
  }

  function getEventIcon(type: string) {
    switch (type) {
      case "reply":
        return <MessageSquare className="h-4 w-4" />;
      case "email_sent":
        return <Mail className="h-4 w-4" />;
      case "open":
      case "email_open":
        return <Eye className="h-4 w-4" />;
      case "click":
      case "email_click":
        return <MousePointerClick className="h-4 w-4" />;
      case "task":
        return <CheckSquare className="h-4 w-4" />;
      case "note":
        return <FileText className="h-4 w-4" />;
      case "resurrection_triggered":
        return <Sparkles className="h-4 w-4 text-purple-500" />;
      default:
        return <Calendar className="h-4 w-4" />;
    }
  }

  function getEventTitle(event: TimelineEvent): string {
    const { type, data } = event;
    switch (type) {
      case "reply":
        return `💬 Reply from ${data.last_direction === "inbound" ? "Lead" : "You"}`;
      case "email_sent":
        return `📧 Email sent${data.subject ? `: ${data.subject}` : ""}`;
      case "open":
      case "email_open":
        return `👀 Email opened`;
      case "click":
      case "email_click":
        return `🖱️ Link clicked${data.url ? `: ${data.url}` : ""}`;
      case "task":
        return `📝 Task: ${data.title || "Untitled"}`;
      case "note":
        return `🗒️ Note added`;
      case "resurrection_triggered":
        return `🧟‍♂️ Lead Resurrection Triggered`;
      default:
        return `${type.replace(/_/g, " ")}`;
    }
  }

  function getEventDescription(event: TimelineEvent): string | null {
    const { type, data } = event;
    switch (type) {
      case "reply":
        return data.ai_label
          ? `Intent: ${data.ai_label}`
          : data.snippet || null;
      case "email_sent":
        return data.subject || null;
      case "click":
      case "email_click":
        return data.url || null;
      case "task":
        return data.details || data.title || null;
      case "note":
        return data.body || null;
      case "resurrection_triggered":
        return data.message || data.metadata?.resurrection_type 
          ? `SmartSend attempted to revive this lead via: ${data.metadata?.resurrection_type || "re-engagement"}`
          : null;
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Activity Timeline</h2>
      {events.map((event) => {
        const description = getEventDescription(event);
        const timeAgo = formatDistanceToNow(new Date(event.created_at), {
          addSuffix: true,
        });

        return (
          <div
            key={event.id}
            className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-muted-foreground">
                {getEventIcon(event.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm">
                    {getEventTitle(event)}
                  </h3>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {timeAgo}
                  </span>
                </div>
                {description && (
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                    {description}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

