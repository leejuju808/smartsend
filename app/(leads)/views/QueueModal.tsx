"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import useSWR from "swr";

type Campaign = {
  id: string;
  name: string;
  created_at: string;
};

type QueuePreview = {
  total: number;
  duplicates: number;
  to_add: number;
};

export function QueueModal({ viewId }: { viewId: string }) {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [limit, setLimit] = useState<number | undefined>(undefined);
  const [preview, setPreview] = useState<QueuePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: campaignsResponse } = useSWR("/api/campaigns/list", (url) =>
    fetch(url).then((res) => res.json())
  );

  const campaigns: Campaign[] = campaignsResponse?.rows ?? [];

  async function loadPreview() {
    setError(null);
    const res = await fetch(`/api/saved-views/${viewId}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        limit,
        dryRun: true,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setPreview(null);
      setError(json.error ?? "Failed to load preview");
      return;
    }

    setPreview(json.preview ?? null);
  }

  async function confirm() {
    setError(null);
    const res = await fetch(`/api/saved-views/${viewId}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        limit,
      }),
    });

    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Failed to queue");
      return;
    }

    setOpen(false);
  }

  useEffect(() => {
    if (!open) {
      setCampaignId("");
      setLimit(undefined);
      setPreview(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    setPreview(null);
    setError(null);
  }, [campaignId, limit]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          Queue to Campaign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Queue to Campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-xs opacity-70">Campaign</div>
            <select
              className="w-full bg-transparent border rounded-md p-2"
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
            >
              <option value="">Select...</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <div className="text-xs opacity-70">Limit (optional)</div>
            <Input
              type="number"
              min={0}
              placeholder="e.g., 1000"
              value={limit ?? ""}
              onChange={(event) =>
                setLimit(
                  event.target.value ? Number.parseInt(event.target.value, 10) : undefined
                )
              }
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={loadPreview}
              disabled={!campaignId}
            >
              Preview
            </Button>
            <Button size="sm" onClick={confirm} disabled={!campaignId}>
              Confirm
            </Button>
          </div>
          {preview ? (
            <div className="text-xs opacity-80 pt-2 space-y-1">
              <div>
                Total in view: <b>{preview.total}</b>
              </div>
              <div>
                Already in campaign: <b>{preview.duplicates}</b>
              </div>
              <div>
                To add: <b>{preview.to_add}</b>
              </div>
            </div>
          ) : null}
          {error ? <div className="text-xs text-red-500">{error}</div> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

