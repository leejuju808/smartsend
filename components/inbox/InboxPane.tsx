"use client";

import useSWR from "swr";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as React from "react";
import { UnlinkedBadge } from "./UnlinkedBadge";
import { UnlinkedDrawer } from "./UnlinkedDrawer";
import { LabelChip } from "./LabelChip";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

type ThreadSummary = {
  thread_id: string;
  campaign_id: string;
  lead_id: string;
  replied: boolean;
  last_message_at: string | null;
  last_dir: string | null;
  last_ai_label: string | null;
  last_snippet: string | null;
  unread_inbound: number;
};

export function InboxPane({
  campaignId,
  onSelect,
  selectedId,
}: {
  campaignId: string;
  onSelect: (id: string) => void;
  selectedId?: string;
}) {
  const [q, setQ] = React.useState("");
  const [unlinkedOpen, setUnlinkedOpen] = React.useState(false);
  const url = `/api/inbox?campaign=${campaignId}&limit=50${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const { data, isLoading, mutate } = useSWR<{ threads: ThreadSummary[] }>(url, fetcher);

  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center justify-between gap-2 p-2">
        <div className="flex flex-1 gap-2">
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button variant="outline" onClick={() => mutate()}>
            Refresh
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <UnlinkedBadge />
          <Button variant="secondary" size="sm" onClick={() => setUnlinkedOpen(true)}>
            Manage Unlinked
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {(data?.threads ?? []).map((t) => (
          <button
            key={t.thread_id}
            onClick={() => onSelect(t.thread_id)}
            className={cn(
              "w-full border-b px-3 py-2 text-left transition hover:bg-zinc-900",
              selectedId === t.thread_id && "bg-zinc-900"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LabelChip label={t.last_ai_label} />
                {!t.last_ai_label && <span className="text-sm font-medium text-zinc-400">unlabeled</span>}
              </div>
              <div className="text-xs text-zinc-500">
                {t.last_message_at ? new Date(t.last_message_at).toLocaleString() : ""}
              </div>
            </div>
            <div className="text-xs text-zinc-400">{t.last_snippet || "—"}</div>
            {t.unread_inbound > 0 && (
              <div className="mt-1 inline-flex items-center rounded-full bg-blue-600/20 px-2 py-0.5 text-[10px] text-blue-300">
                {t.unread_inbound} new
              </div>
            )}
          </button>
        ))}
        {(!data?.threads || data.threads.length === 0) && !isLoading && (
          <div className="p-4 text-sm text-zinc-500">No threads.</div>
        )}
      </div>
      <UnlinkedDrawer
        open={unlinkedOpen}
        onOpenChange={setUnlinkedOpen}
        defaultCampaignId={campaignId}
      />
    </div>
  );
}


