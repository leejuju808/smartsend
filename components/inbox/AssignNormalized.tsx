"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Props = {
  nmId: string;
  defaultCampaignId?: string;
  onAssigned?: () => void;
};

export function AssignNormalized({ nmId, defaultCampaignId, onAssigned }: Props) {
  const [campaignId, setCampaignId] = React.useState(defaultCampaignId ?? "");
  const [leadId, setLeadId] = React.useState("");
  const [threadId, setThreadId] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function assign() {
    if (!campaignId || !leadId) {
      toast.error("Campaign & Lead required");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch(`/api/normalized/${nmId}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          lead_id: leadId,
          thread_id: threadId || undefined,
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j?.error ?? "Assign failed");
        return;
      }

      toast.success("Linked");
      onAssigned?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-md p-3 space-y-2 bg-background/60">
      <Input
        placeholder="Campaign ID"
        value={campaignId}
        onChange={(e) => setCampaignId(e.target.value)}
      />
      <Input
        placeholder="Lead ID"
        value={leadId}
        onChange={(e) => setLeadId(e.target.value)}
      />
      <Input
        placeholder="(Optional) Thread ID"
        value={threadId}
        onChange={(e) => setThreadId(e.target.value)}
      />
      <Button size="sm" onClick={assign} disabled={loading}>
        {loading ? "Assigning..." : "Assign"}
      </Button>
    </div>
  );
}

