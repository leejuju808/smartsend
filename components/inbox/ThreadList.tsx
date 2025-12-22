"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { LabelChip } from "./LabelChip";

type ThreadSummary = {
  id: string;
  subject: string | null;
  last_ai_label?: string | null;
  status?: string | null;
  last_message_at?: string | null;
  updated_at?: string | null;
  unread_inbound?: number | null;
  stopped_by_reply?: boolean | null;
};

type ThreadListProps = {
  threads: ThreadSummary[];
  activeThreadId?: string | null;
  onThreadClick: (threadId: string) => void;
};

export function ThreadList({ threads, activeThreadId, onThreadClick }: ThreadListProps) {
  if (!threads || threads.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        No threads match your filters.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md border">
      <div className="flex-1 overflow-auto">
        {threads.map((t) => {
          const timestamp = t.last_message_at ?? t.updated_at ?? null;
          const unreadCount = typeof t.unread_inbound === "number" ? t.unread_inbound : 0;

          return (
            <button
              key={t.id}
              onClick={() => onThreadClick(t.id)}
              className={cn(
                "flex w-full flex-col gap-1 border-b p-3 text-left transition hover:bg-accent",
                activeThreadId === t.id ? "bg-accent" : "bg-background"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {t.subject || "(no subject)"}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {unreadCount > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Needs reply
                        </span>
                      )}
                      {t.stopped_by_reply && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                          Paused
                        </span>
                      )}
                    </div>
                  </div>
                  {t.last_ai_label ? (
                    <div className="mt-1">
                      <LabelChip label={t.last_ai_label} />
                    </div>
                  ) : null}
                  {unreadCount > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Unread replies: {unreadCount}
                    </div>
                  )}
                </div>
                {timestamp && (
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {new Date(timestamp).toLocaleString()}
                  </div>
                )}
              </div>
              {t.status && (
                <div className="text-xs text-muted-foreground">Status: {t.status}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
