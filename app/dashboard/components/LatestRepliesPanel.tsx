"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/badge";
import { MessageSquare } from "lucide-react";

interface LatestReply {
  threadId: string;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  latestIntent: string | null;
  snippet: string | null;
  lastActivityAt: string;
  campaignName?: string | null;
}

interface LatestRepliesPanelProps {
  latestReplies: LatestReply[];
}

const intentColors: Record<string, "default" | "secondary" | "destructive" | "outline" | "success"> = {
  hot: "destructive",
  warm: "success",
  follow_up: "default",
  not_interested: "secondary",
  unclassified: "outline",
};

export function LatestRepliesPanel({ latestReplies }: LatestRepliesPanelProps) {
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-500" />
          Latest Replies
        </CardTitle>
      </CardHeader>
      <CardContent>
        {latestReplies.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            No replies in the last 48 hours.
          </div>
        ) : (
          <div className="space-y-3">
            {latestReplies.map((reply) => (
              <Link
                key={reply.threadId}
                href={`/inbox/replies?threadId=${reply.threadId}`}
                className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">
                        {reply.contactName || reply.contactEmail || "Unknown"}
                      </span>
                      {reply.latestIntent && (
                        <Badge variant={intentColors[reply.latestIntent] || "outline"}>
                          {reply.latestIntent.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    {reply.snippet && (
                      <div className="text-sm text-muted-foreground truncate">
                        {reply.snippet}
                      </div>
                    )}
                    {reply.campaignName && (
                      <div className="text-xs text-muted-foreground mt-1">
                        From: {reply.campaignName}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatTimeAgo(reply.lastActivityAt)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

