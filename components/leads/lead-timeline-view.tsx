"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/src/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  Mail,
  MailOpen,
  MessageSquare,
  Clock,
  Flame,
  RefreshCw,
} from "lucide-react";

// Date formatting with fallback
function formatDistanceToNow(date: Date | string): string {
  try {
    const { formatDistanceToNow: fn } = require("date-fns");
    return fn(new Date(date), { addSuffix: true });
  } catch {
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

function formatDate(date: Date | string): string {
  try {
    const { format: fn } = require("date-fns");
    return fn(new Date(date), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return new Date(date).toLocaleString();
  }
}

interface TimelineMessage {
  id: string;
  type: "reply" | "email_sent" | "note" | "call";
  direction: "inbound" | "outbound" | "internal";
  timestamp: string;
  event_time?: string;
  event_type?: string;
  subject?: string | null;
  body_text?: string | null;
  body_preview?: string | null;
  body_html?: string | null;
  from_email?: string | null;
  to_email?: string | string[] | null;
  intent?: string | null;
  intent_label?:
    | "hot_lead"
    | "warm_lead"
    | "follow_up"
    | "not_interested"
    | "out_of_office"
    | "wrong_contact"
    | "unsubscribe"
    | "unknown"
    | null;
  intent_confidence?: number | null;
  human_reply?: boolean;
  is_hot?: boolean;
  classification_label?: string | null;
  campaign_id?: string | null;
  source?: string;
}

interface LeadTimelineViewProps {
  leadId: string;
  onRefresh?: () => void;
}

/**
 * Block 8450 — Lead Timeline View
 * Shows every email sent + every reply received for a single lead in chronological order
 */
export function LeadTimelineView({ leadId, onRefresh }: LeadTimelineViewProps) {
  const [messages, setMessages] = useState<TimelineMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchMessages = async () => {
    try {
      setError(null);
      const response = await fetch(`/api/leads/${leadId}/timeline`);
      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }
      const data = await response.json();
      // Transform the timeline events to match our interface
      const transformed = (data || []).map((event: any) => ({
        id: event.id,
        type: event.event_type === "reply_received" ? "reply" : 
              event.event_type === "email_sent" ? "email_sent" :
              event.event_type === "note" ? "note" :
              event.event_type === "call" ? "call" : "email_sent",
        direction: event.direction,
        timestamp: event.event_time,
        event_time: event.event_time,
        event_type: event.event_type,
        subject: event.subject,
        body_text: event.body_preview,
        body_preview: event.body_preview,
        intent: event.intent,
        is_hot: event.is_hot,
      }));
      setMessages(transformed);
      setLastRefresh(new Date());
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
      console.error("Error fetching timeline messages:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();

    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      fetchMessages();
    }, 10000);

    return () => clearInterval(interval);
  }, [leadId]);

  const getIntentColor = (
    intent: TimelineMessage["intent_label"]
  ): string => {
    switch (intent) {
      case "hot_lead":
        return "bg-red-500/10 text-red-600 border-red-500/30";
      case "warm_lead":
        return "bg-orange-500/10 text-orange-600 border-orange-500/30";
      case "follow_up":
        return "bg-blue-500/10 text-blue-600 border-blue-500/30";
      case "not_interested":
        return "bg-gray-500/10 text-gray-600 border-gray-500/30";
      case "out_of_office":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
      case "unsubscribe":
        return "bg-purple-500/10 text-purple-600 border-purple-500/30";
      default:
        return "bg-slate-500/10 text-slate-600 border-slate-500/30";
    }
  };

  const getIntentLabel = (intent: TimelineMessage["intent_label"]): string => {
    switch (intent) {
      case "hot_lead":
        return "Hot Lead";
      case "warm_lead":
        return "Warm Lead";
      case "follow_up":
        return "Follow Up";
      case "not_interested":
        return "Not Interested";
      case "out_of_office":
        return "Out of Office";
      case "unsubscribe":
        return "Unsubscribe";
      default:
        return "Unknown";
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      // If within last 7 days, show relative time
      if (diffDays < 7) {
        return formatDistanceToNow(date);
      }

      // Otherwise show formatted date/time
      return formatDate(date);
    } catch {
      return timestamp;
    }
  };

  const truncateBody = (text: string | null | undefined, maxLength = 200): string => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  if (loading && messages.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading timeline...</span>
        </div>
      </Card>
    );
  }

  if (error && messages.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-destructive">
          <p>Error loading timeline: {error}</p>
          <button
            onClick={fetchMessages}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </Card>
    );
  }

  if (messages.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center py-12 text-muted-foreground">
          <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No messages yet</p>
          <p className="text-sm mt-2">
            Emails and replies will appear here in chronological order
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Email Timeline</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Every email sent and reply received in chronological order
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Last refreshed {formatDistanceToNow(lastRefresh)}</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-border -translate-x-1/2" />

        <div className="space-y-8">
          {messages.map((message, index) => {
            const isOutbound = message.direction === "outbound";
            const isInbound = message.direction === "inbound";
            const isInternal = message.direction === "internal";

            // Alignment
            const alignmentClass = isInternal
              ? "justify-center"
              : isOutbound
              ? "justify-start"
              : "justify-end";

            // Label
            const directionLabel = isInternal
              ? message.event_type === "call"
                ? "Call Logged"
                : "Internal Note"
              : isOutbound
              ? "SmartSend → Homeowner"
              : "Homeowner → You";

            const isHotLead = message.is_hot || message.intent_label === "hot_lead";

            return (
              <div
                key={message.id}
                className={cn(
                  "relative flex items-start gap-4",
                  alignmentClass
                )}
              >
                {/* Timeline dot */}
                <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background border-2 border-border">
                  {isInternal ? (
                    message.event_type === "call" ? (
                      <Clock className="h-4 w-4 text-amber-600" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-amber-600" />
                    )
                  ) : isOutbound ? (
                    <Mail className="h-4 w-4 text-blue-600" />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-green-600" />
                  )}
                </div>

                {/* Message card */}
                <div
                  className={cn(
                    "flex-1 rounded-lg border p-4 shadow-sm",
                    isInternal
                      ? "max-w-xl border-amber-700/60 bg-amber-950/40"
                      : "bg-card",
                    isOutbound
                      ? "ml-auto max-w-[70%]"
                      : isInbound
                      ? "mr-auto max-w-[70%]"
                      : "",
                    isHotLead && "ring-2 ring-red-500/20"
                  )}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          "font-semibold text-sm uppercase tracking-wide",
                          isInternal && "text-amber-400"
                        )}>
                          {directionLabel}
                        </span>
                        {message.intent && !isInternal && (
                          <Badge
                            variant="outline"
                            className="text-xs border-neutral-700"
                          >
                            {message.intent}
                          </Badge>
                        )}
                        {isHotLead && (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs"
                          >
                            <Flame className="h-3 w-3 mr-1" />
                            Hot Lead
                          </Badge>
                        )}
                      </div>
                      {message.subject && (
                        <p className={cn(
                          "text-sm font-semibold mt-1",
                          isInternal ? "text-neutral-100" : "text-neutral-100"
                        )}>
                          {message.subject}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {formatTimestamp(message.timestamp || message.event_time || "")}
                    </span>
                  </div>

                  {/* Email addresses - only show for emails */}
                  {!isInternal && (
                    <div className="text-xs text-muted-foreground mb-2">
                      {isOutbound ? (
                        <>
                          <span className="font-medium">To:</span>{" "}
                          {Array.isArray(message.to_email)
                            ? message.to_email.join(", ")
                            : message.to_email || "N/A"}
                        </>
                      ) : (
                        <>
                          <span className="font-medium">From:</span>{" "}
                          {message.from_email || "N/A"}
                        </>
                      )}
                    </div>
                  )}

                  {/* Body preview */}
                  {(message.body_text || message.body_preview) && (
                    <div className={cn(
                      "mt-3",
                      !isInternal && "pt-3 border-t"
                    )}>
                      <p className={cn(
                        "text-sm whitespace-pre-wrap",
                        isInternal ? "text-neutral-200" : "text-muted-foreground"
                      )}>
                        {truncateBody(message.body_text || message.body_preview || "")}
                        {(message.body_text || message.body_preview || "").length === 240 && "…"}
                      </p>
                    </div>
                  )}

                  {/* Event type footer for internal notes */}
                  {isInternal && (
                    <div className="mt-1 text-[0.7rem] uppercase tracking-wide text-neutral-500">
                      {message.event_type}
                    </div>
                  )}

                  {/* Confidence score if available */}
                  {message.intent_confidence !== null &&
                    message.intent_confidence !== undefined && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Confidence:{" "}
                        {Math.round(message.intent_confidence * 100)}%
                      </div>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

