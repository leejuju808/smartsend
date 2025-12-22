"use client";

import { useMemo } from "react";
import type { ReplyThreadSummary } from "@/types/reply-inbox";
import IntentBadge from "./IntentBadge";
import StatusPill from "./StatusPill";
// Using native Date formatting instead of date-fns for simplicity

interface ReplyListProps {
  threads: ReplyThreadSummary[];
  loading: boolean;
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onReload: () => void;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return `${diffDays} days ago`;
    }
  } catch {
    return dateString;
  }
}

function groupThreadsByDate(threads: ReplyThreadSummary[]) {
  const groups: { label: string; threads: ReplyThreadSummary[] }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayThreads: ReplyThreadSummary[] = [];
  const yesterdayThreads: ReplyThreadSummary[] = [];
  const thisWeekThreads: ReplyThreadSummary[] = [];
  const olderThreads: ReplyThreadSummary[] = [];

  threads.forEach((thread) => {
    const threadDate = new Date(thread.latestAt);
    threadDate.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - threadDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      todayThreads.push(thread);
    } else if (diffDays === 1) {
      yesterdayThreads.push(thread);
    } else if (diffDays < 7) {
      thisWeekThreads.push(thread);
    } else {
      olderThreads.push(thread);
    }
  });

  if (todayThreads.length > 0) {
    groups.push({ label: "Today", threads: todayThreads });
  }
  if (yesterdayThreads.length > 0) {
    groups.push({ label: "Yesterday", threads: yesterdayThreads });
  }
  if (thisWeekThreads.length > 0) {
    groups.push({ label: "This week", threads: thisWeekThreads });
  }
  if (olderThreads.length > 0) {
    groups.push({ label: "Older", threads: olderThreads });
  }

  return groups;
}

export default function ReplyList({
  threads,
  loading,
  selectedThreadId,
  onSelectThread,
}: ReplyListProps) {
  const groupedThreads = useMemo(() => groupThreadsByDate(threads), [threads]);

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No replies found
      </div>
    );
  }

  return (
    <div className="divide-y">
      {groupedThreads.map((group) => (
        <div key={group.label}>
          <div className="sticky top-0 bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground">
            {group.label}
          </div>
          {group.threads.map((thread) => (
            <div
              key={thread.id}
              onClick={() => onSelectThread(thread.id)}
              className={`cursor-pointer border-b p-4 transition-colors hover:bg-muted/50 ${
                selectedThreadId === thread.id ? "bg-muted border-l-4 border-l-primary" : ""
              } ${thread.unread ? "font-semibold" : ""} ${
                thread.latestIntent === "hot" ? "border-l-2 border-l-orange-500" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <IntentBadge intent={thread.latestIntent} />
                    <span className="font-medium truncate">
                      {thread.contactName || thread.contactEmail || "Unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(thread.latestAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    {thread.campaignName && (
                      <span className="px-2 py-0.5 bg-muted rounded text-xs">
                        {thread.campaignName}
                      </span>
                    )}
                    <span className="truncate">
                      {thread.latestSnippet || thread.subject || "(no preview)"}
                    </span>
                  </div>
                  {/* Assignee pill */}
                  {thread.assignedTo ? (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                        {thread.assignedToName || "Assigned"}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                        Unassigned
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusPill status={thread.status} />
                  {thread.unread && (
                    <div className="w-2 h-2 bg-primary rounded-full" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

