"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getIntentColor, getIntentLabel } from "./intentUtils";
function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString();
}

type Message = {
  id: string;
  subject: string;
  bodySnippet: string;
  sender: string;
  senderEmail: string;
  intent: string;
  replied: boolean;
  requiresFollowup: boolean;
  createdAt: string;
  readAt: string | null;
  lead: {
    id: string;
    name: string;
    email: string;
    status: string;
  } | null;
  campaign: {
    id: string;
    name: string;
  } | null;
};

export function MessageCard({
  message,
  isSelected,
  onClick,
}: {
  message: Message;
  isSelected: boolean;
  onClick: () => void;
}) {
  const intentColor = getIntentColor(message.intent);
  const intentLabel = getIntentLabel(message.intent);
  const isUnread = !message.readAt;
  const timeAgo = formatTimeAgo(message.createdAt);

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? "ring-2 ring-primary border-primary" : ""
      } ${isUnread ? "border-l-4 border-l-primary bg-primary/5" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`font-semibold truncate ${isUnread ? "font-bold" : ""}`}>
                {message.lead?.name || message.sender || message.senderEmail}
              </span>

              {/* Intent badge */}
              <Badge className={intentColor} variant="outline">
                {intentLabel}
              </Badge>

              {/* Status badges */}
              {message.replied && (
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  Replied
                </Badge>
              )}

              {message.requiresFollowup && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                  Pressure
                </Badge>
              )}

              {isUnread && (
                <Badge variant="default" className="bg-primary text-primary-foreground">
                  New
                </Badge>
              )}
            </div>

            {/* Subject */}
            <div className="font-medium text-sm mb-1 truncate">
              {message.subject || "(No subject)"}
            </div>

            {/* Snippet */}
            <div className="text-sm text-muted-foreground line-clamp-2 mb-2">
              {message.bodySnippet}
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{timeAgo}</span>
              {message.campaign && (
                <>
                  <span>•</span>
                  <span>{message.campaign.name}</span>
                </>
              )}
              {message.lead?.status && (
                <>
                  <span>•</span>
                  <span className="capitalize">{message.lead.status}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


































