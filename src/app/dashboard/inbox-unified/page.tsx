"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { UnifiedInboxView } from "./components/UnifiedInboxView";
import { MessageDetailPanel } from "./components/MessageDetailPanel";

export default function UnifiedInboxPage() {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const sp = useSearchParams();

  // Deep-link support: /dashboard/inbox-unified?mid=<message_id>
  useEffect(() => {
    const mid = sp.get("mid");
    if (mid && mid !== selectedMessageId) {
      setSelectedMessageId(mid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Main inbox list */}
      <div className="flex-1 border-r">
        <UnifiedInboxView 
          onSelectMessage={setSelectedMessageId}
          selectedMessageId={selectedMessageId}
        />
      </div>

      {/* Side panel for message details */}
      {selectedMessageId && (
        <div className="w-[500px] border-l">
          <MessageDetailPanel
            messageId={selectedMessageId}
            onClose={() => setSelectedMessageId(null)}
          />
        </div>
      )}
    </div>
  );
}


































