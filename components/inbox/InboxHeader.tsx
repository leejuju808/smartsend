"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type InboxHeaderProps = {
  campaignId?: string;
};

export default function InboxHeader({ campaignId }: InboxHeaderProps) {
  const [needsOnly, setNeedsOnly] = React.useState(true);
  const [counts, setCounts] = React.useState<{ needs: number; all: number }>({ needs: 0, all: 0 });

  const loadCounts = React.useCallback(async () => {
    const u = new URL("/api/inbox/counters", window.location.origin);
    if (campaignId) {
      u.searchParams.set("campaign_id", campaignId);
    }
    const response = await fetch(u.toString(), { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (payload?.ok) {
      setCounts({ needs: payload.needs, all: payload.all });
    }
  }, [campaignId]);

  React.useEffect(() => {
    loadCounts();
    const handler = () => loadCounts();
    window.addEventListener("inbox:counts:refresh", handler);
    return () => window.removeEventListener("inbox:counts:refresh", handler);
  }, [campaignId, loadCounts]);

  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent("inbox:filter:update", { detail: { needsOnly } }));
  }, [needsOnly]);

  return (
    <div className="flex items-center justify-between border-b p-3">
      <div className="font-semibold">Replies Inbox</div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={needsOnly ? "default" : "outline"}
          onClick={() => setNeedsOnly(true)}
          title="Show only threads that need a reply"
        >
          Needs reply ({counts.needs})
        </Button>
        <Button
          size="sm"
          variant={!needsOnly ? "default" : "outline"}
          onClick={() => setNeedsOnly(false)}
          title="Show all replied/unreplied"
        >
          All ({counts.all})
        </Button>
      </div>
    </div>
  );
}

