"use client";

import * as React from "react";
import { InboxThreadRow, type InboxThread } from "@/components/inbox/InboxThreadRow";

type AllInboxProps = {
  selectedThreadId?: string | null;
  onSelectThread?: (id: string) => void;
};

export function AllInbox({
  selectedThreadId,
  onSelectThread,
}: AllInboxProps) {
  const [threads, setThreads] = React.useState<InboxThread[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchAll = async () => {
      try {
        // Use the inbox_view API or adapt existing API
        // For now, we'll use a simple approach - fetch from inbox_view
        const res = await fetch("/api/inbox/v2/threads?filter=all&limit=100");
        if (!res.ok) throw new Error("Failed to load inbox");
        const json = await res.json();
        
        // Transform v2 threads format to InboxThread format
        const transformedThreads: InboxThread[] = (json.threads || []).map((t: any) => ({
          id: t.id,
          subject: t.snippet ? t.snippet.slice(0, 50) + "..." : null,
          last_message_preview: t.snippet || null,
          last_message_at: t.last_message_at,
          contact_first_name: t.lead?.first_name || null,
          contact_email: t.lead?.email || "",
          contact_city: t.lead?.city || null,
          lead_intent: t.latest_intent?.toLowerCase() || null,
          follow_up_stage: null, // v2 doesn't have this
          follow_up_status: t.status || null,
          estimated_job_value: t.estimated_value || null,
        }));
        
        setThreads(transformedThreads);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          All Threads
        </div>
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Loading threads…
        </div>
      </div>
    );
  }

  if (!threads.length) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          All Threads
        </div>
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          No threads found.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        All Threads
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
    </div>
  );
}











































