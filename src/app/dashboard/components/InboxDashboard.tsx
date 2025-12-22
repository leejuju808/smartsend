"use client";

import { useEffect, useState } from "react";
import { LabelBadge, type ThreadLabel } from "@/app/inbox/components/LabelBadge";
import { OOOChip } from "@/app/inbox/components/OOOChip";

type InboxItem = {
  threadId: string;
  subject: string | null;
  preview: string | null;
  label: ThreadLabel;
  hasActiveOOO: boolean;
  resumeAfter: string | null;
  oooPreview: string | null;
};

export default function InboxDashboard() {
  const [items, setItems] = useState<InboxItem[]>([]);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/inbox/list");
      const data = await res.json();
      setItems((data.items ?? []).slice(0, 5));
    }

    load();
  }, []);

  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <h3 className="text-lg font-semibold">📬 AI Inbox Assistant</h3>
      {items.length === 0 && (
        <p className="text-sm text-zinc-500">No recent threads detected.</p>
      )}
      {items.map((item) => (
        <div key={item.threadId} className="space-y-1 rounded-xl border p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium">
                {item.subject ?? "(no subject)"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {item.preview ?? ""}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <LabelBadge label={item.label} />
              <OOOChip
                resumeAfter={item.resumeAfter}
                active={item.hasActiveOOO}
                cleanPreview={item.oooPreview ?? undefined}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}