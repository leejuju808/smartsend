"use client";

import * as React from "react";
import { InboxThreadRow, type InboxThread } from "@/components/inbox/InboxThreadRow";

type PriorityInboxProps = {
  selectedThreadId?: string | null;
  onSelectThread?: (id: string) => void;
};

export function PriorityInbox({
  selectedThreadId,
  onSelectThread,
}: PriorityInboxProps) {
  const [threads, setThreads] = React.useState<InboxThread[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchPriority = async () => {
      try {
        const res = await fetch("/api/inbox/priority");
        if (!res.ok) throw new Error("Failed to load priority inbox");
        const json = await res.json();
        setThreads(json.data ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchPriority();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Priority Queue
        </div>
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Loading priority leads…
        </div>
      </div>
    );
  }

  if (!threads.length) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Priority Queue
        </div>
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          No hot or warm leads in your priority queue yet.
          <br />
          Once SmartSend starts classifying replies, your most valuable homeowners will appear here first.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Priority Queue
      </div>
      <div className="flex-1 overflow-y-auto">
        {threads.map((thread) => (
          <InboxThreadRow
            key={thread.id}
            thread={thread}
            isSelected={selectedThreadId === thread.id}
            onClick={() => onSelectThread?.(thread.id)}
          />
        ))}
      </div>
      <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">
        SmartSend shows only hot &amp; warm leads here — sorted by value and recency — so you can
        work the jobs that matter first.
      </div>
    </div>
  );
}











































