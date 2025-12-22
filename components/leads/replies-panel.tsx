"use client";

import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

// Simple date formatting fallback
function formatDistanceToNow(date: Date | string): string {
  try {
    const { formatDistanceToNow: fn } = require("date-fns");
    return fn(new Date(date), { addSuffix: true });
  } catch {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    return then.toLocaleDateString();
  }
}

interface ReplyThread {
  id: string;
  lead_id: string;
  campaign_id?: string | null;
  last_message_at?: string | null;
  last_label?: string | null;
  status?: string;
  ai_summary?: string | null;
}

interface RepliesPanelProps {
  threads: ReplyThread[];
}

export function RepliesPanel({ threads }: RepliesPanelProps) {
  if (!threads || threads.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Replies</h2>
      <div className="space-y-3">
        {threads.map((thread) => {
          const timeAgo = thread.last_message_at
            ? formatDistanceToNow(new Date(thread.last_message_at), {
                addSuffix: true,
              })
            : "Unknown";

          return (
            <div
              key={thread.id}
              className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">Thread</span>
                    {thread.last_label && (
                      <Badge variant="outline" className="text-xs">
                        {thread.last_label}
                      </Badge>
                    )}
                    {thread.status && (
                      <Badge
                        variant={
                          thread.status === "open"
                            ? "default"
                            : thread.status === "closed"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-xs"
                      >
                        {thread.status}
                      </Badge>
                    )}
                  </div>
                  {thread.ai_summary && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {thread.ai_summary}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Last message {timeAgo}
                  </p>
                </div>
                <Link href={`/inbox/thread/${thread.id}`}>
                  <Button variant="outline" size="sm">
                    Open
                  </Button>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

