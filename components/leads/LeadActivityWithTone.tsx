// Block 21823 — SmartSend Roofing Homeowner Tone Intent Engine v1
// Example component showing how to integrate HomeownerToneTag with lead_activities

"use client";

import { HomeownerToneTag } from "@/components/lead/HomeownerToneTag";
import { MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface LeadActivity {
  id: string;
  created_at: string;
  lead_id: string;
  campaign_id: string;
  kind: "message_in" | "message_out" | "status_change" | "owner_change" | "task_open" | "task_done" | "automation" | "system" | "note";
  title: string | null;
  body: string | null;
  homeowner_tone: string | null;
  homeowner_intent: string | null;
  meta: Record<string, any>;
}

interface LeadActivityWithToneProps {
  activity: LeadActivity;
}

export function LeadActivityWithTone({ activity }: LeadActivityWithToneProps) {
  const timeAgo = formatDistanceToNow(new Date(activity.created_at), {
    addSuffix: true,
  });

  return (
    <div className="relative flex gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      {/* Icon */}
      <div className="relative z-10 mt-0.5 flex-shrink-0">
        <div className="rounded-full bg-background border-2 border-background p-1">
          {activity.kind === "message_in" ? (
            <MessageSquare className="h-4 w-4 text-orange-500" />
          ) : (
            <MessageSquare className="h-4 w-4 text-blue-500" />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h3 className="font-semibold text-sm">
              {activity.title || (activity.kind === "message_in" ? "Message from homeowner" : "Message sent")}
            </h3>
            {/* Display tone and intent tags for message_in activities */}
            {activity.kind === "message_in" && (
              <div className="mt-1">
                <HomeownerToneTag
                  tone={activity.homeowner_tone}
                  intent={activity.homeowner_intent}
                  compact={true}
                />
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {timeAgo}
          </span>
        </div>
        {activity.body && (
          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">
            {activity.body}
          </p>
        )}
      </div>
    </div>
  );
}









































