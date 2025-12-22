"use client";

import * as React from "react";
import { InboxThreads } from "./InboxThreads";
import { ThreadViewer } from "./ThreadViewer";

export default function InboxPage({ params }: { params: { id: string } }) {
  const [selectedThread, setSelectedThread] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const handleUpdated = React.useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  return (
    <div className="grid h-[calc(100vh-180px)] grid-cols-1 gap-4 md:grid-cols-2">
      <InboxThreads campaignId={params.id} onSelect={setSelectedThread} refreshKey={refreshKey} />
      <div className="min-h-0">
        {selectedThread ? (
          <ThreadViewer key={selectedThread} threadId={selectedThread} onUpdated={handleUpdated} />
        ) : (
          <div className="flex h-full items-center justify-center rounded-md border p-4 text-sm text-muted-foreground">
            Select a thread →
          </div>
        )}
      </div>
    </div>
  );
}



