"use client";

import * as React from "react";
import { InboxPane } from "@/components/inbox/InboxPane";
import { ThreadView } from "@/components/inbox/ThreadView";

export default function Page({ params }: { params: { id: string } }) {
  const [threadId, setThreadId] = React.useState<string>();
  // If you already have lead_id for a thread, you can fetch it via /api/inbox/{thread}
  // For now, pass undefined; the send endpoint still queues using provided leadId.
  const leadId = undefined as any;

  return (
    <div className="grid h-[calc(100vh-64px)] grid-cols-[360px,1fr]">
      <InboxPane campaignId={params.id} selectedId={threadId} onSelect={setThreadId} />
      <ThreadView threadId={threadId} campaignId={params.id} leadId={leadId} />
    </div>
  );
}


