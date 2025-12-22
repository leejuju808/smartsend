"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/src/components/ui/Card";
import {
  Mail,
  Clock,
  MessageSquare,
  Tag,
  RefreshCw,
  FileText,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type LeadEventType =
  | "email_sent"
  | "followup_triggered"
  | "reply_received"
  | "classified"
  | "followup_stopped"
  | "note_added"
  | "status_changed"
  | "action_suggested";

export interface LeadEvent {
  id: string;
  type: LeadEventType;
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
}

interface TimelineEventCardProps {
  event: LeadEvent;
}

/**
 * Block 11200 — SmartSend Lead Timeline v1
 * Individual event card component
 */
export function TimelineEventCard({ event }: TimelineEventCardProps) {
  const getEventIcon = () => {
    switch (event.type) {
      case "email_sent":
        return <Mail className="h-4 w-4 text-blue-600" />;
      case "followup_triggered":
        return <Clock className="h-4 w-4 text-purple-600" />;
      case "reply_received":
        return <MessageSquare className="h-4 w-4 text-green-600" />;
      case "classified":
        return <Tag className="h-4 w-4 text-orange-600" />;
      case "followup_stopped":
        return <RefreshCw className="h-4 w-4 text-gray-600" />;
      case "note_added":
        return <FileText className="h-4 w-4 text-amber-600" />;
      case "status_changed":
        return <CheckCircle2 className="h-4 w-4 text-indigo-600" />;
      case "action_suggested":
        return <Lightbulb className="h-4 w-4 text-yellow-600" />;
      default:
        return <MessageSquare className="h-4 w-4 text-gray-600" />;
    }
  };

  const getEventTypeLabel = () => {
    switch (event.type) {
      case "email_sent":
        return "📤 Email Sent";
      case "followup_triggered":
        return "⏱ Follow-Up Triggered";
      case "reply_received":
        return "📥 Homeowner Replied";
      case "classified":
        return "🏷️ Lead Classified";
      case "followup_stopped":
        return "🔁 Follow-Up Stopped";
      case "note_added":
        return "📌 Internal Note";
      case "status_changed":
        return "✓ Status Changed";
      case "action_suggested":
        return "💡 Suggested Action";
      default:
        return "Event";
    }
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      }) + " at " + date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const getIntentBadge = () => {
    const intentLabel = event.metadata?.intent_label;
    if (!intentLabel) return null;

    const intentMap: Record<string, { label: string; className: string }> = {
      HOT: {
        label: "HOT",
        className: "bg-red-500/15 text-red-600 border-red-500/30",
      },
      WARM: {
        label: "WARM",
        className: "bg-orange-500/15 text-orange-600 border-orange-500/30",
      },
      NOT_INTERESTED: {
        label: "NOT INTERESTED",
        className: "bg-gray-500/15 text-gray-600 border-gray-500/30",
      },
    };

    const config = intentMap[intentLabel.toUpperCase()];
    if (!config) return null;

    return (
      <Badge variant="outline" className={`text-xs ${config.className}`}>
        Intent: {config.label}
      </Badge>
    );
  };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">{getEventIcon()}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{getEventTypeLabel()}</span>
              {getIntentBadge()}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
              {formatDate(event.created_at)}
            </span>
          </div>

          {/* Content */}
          <p className="text-sm text-foreground mb-2">{event.content}</p>

          {/* Metadata Preview */}
          {event.metadata && (
            <div className="space-y-1 mt-2">
              {event.metadata.subject && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Subject:</span> {event.metadata.subject}
                </div>
              )}
              {event.metadata.body_preview && (
                <div className="text-xs text-muted-foreground line-clamp-2">
                  <span className="font-medium">Preview:</span> {event.metadata.body_preview}
                </div>
              )}
              {event.metadata.reply_text && (
                <div className="text-xs text-muted-foreground line-clamp-2">
                  <span className="font-medium">Reply:</span> {event.metadata.reply_text}
                </div>
              )}
              {event.metadata.note_text && (
                <div className="text-xs text-muted-foreground line-clamp-2">
                  <span className="font-medium">Note:</span> {event.metadata.note_text}
                </div>
              )}
              {event.metadata.next_step && (
                <div className="text-xs text-blue-600 font-medium mt-1">
                  <span className="font-semibold">Next Step:</span> {event.metadata.next_step}
                </div>
              )}
              {event.metadata.follow_up_at && (
                <div className="text-xs text-purple-600 font-medium mt-1">
                  <span className="font-semibold">Follow-Up:</span>{" "}
                  {new Date(event.metadata.follow_up_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              )}
              {event.metadata.action_text && (
                <div className="text-xs text-blue-600 font-medium">
                  {event.metadata.action_text}
                </div>
              )}
              {event.metadata.confidence !== undefined && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Confidence:</span>{" "}
                  {Math.round(event.metadata.confidence * 100)}%
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

