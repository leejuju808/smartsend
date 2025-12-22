"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type InboxThread = {
  id: string;
  subject: string | null;
  last_message_preview: string | null;
  last_message_at: string;
  contact_first_name: string | null;
  contact_email: string;
  contact_city: string | null;
  lead_intent: string | null;
  follow_up_stage: string | null;
  follow_up_status: string | null;
  estimated_job_value: number | null;
};

type InboxThreadRowProps = {
  thread: InboxThread;
  isSelected?: boolean;
  onClick?: () => void;
};

const INTENT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  hot: {
    bg: "bg-red-100",
    text: "text-red-800",
    label: "Hot",
  },
  warm: {
    bg: "bg-orange-100",
    text: "text-orange-800",
    label: "Warm",
  },
};

const STAGE_LABELS: Record<string, string> = {
  none: "Initial",
  fu_1: "Follow-up 1",
  fu_2: "Follow-up 2",
  fu_3: "Follow-up 3",
};

export function InboxThreadRow({
  thread,
  isSelected = false,
  onClick,
}: InboxThreadRowProps) {
  const intentColor = thread.lead_intent
    ? INTENT_COLORS[thread.lead_intent] || { bg: "bg-gray-100", text: "text-gray-800", label: thread.lead_intent }
    : null;

  const stageLabel = thread.follow_up_stage
    ? STAGE_LABELS[thread.follow_up_stage] || thread.follow_up_stage
    : null;

  const formatValue = (value: number | null) => {
    if (!value) return null;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "cursor-pointer border-b px-3 py-3 transition-colors hover:bg-muted/40",
        isSelected && "bg-muted"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm truncate">
              {thread.contact_first_name || "Homeowner"}
            </span>
            {intentColor && (
              <Badge
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  intentColor.bg,
                  intentColor.text
                )}
              >
                {intentColor.label}
              </Badge>
            )}
            {thread.follow_up_stage && stageLabel && (
              <Badge
                variant="outline"
                className="rounded-full px-2 py-0.5 text-[10px]"
              >
                {stageLabel}
              </Badge>
            )}
            {thread.follow_up_status && thread.follow_up_status !== "active" && (
              <Badge
                variant="outline"
                className="rounded-full px-2 py-0.5 text-[10px]"
              >
                {thread.follow_up_status}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mb-1">
            {thread.contact_email}
            {thread.contact_city && ` · ${thread.contact_city}`}
          </div>
          {thread.last_message_preview && (
            <div className="text-xs text-muted-foreground line-clamp-2">
              {thread.last_message_preview}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {thread.estimated_job_value && (
            <div className="text-sm font-semibold text-green-700">
              {formatValue(thread.estimated_job_value)}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground">
            {formatDate(thread.last_message_at)}
          </div>
        </div>
      </div>
    </div>
  );
}











































