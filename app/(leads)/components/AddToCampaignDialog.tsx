"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Campaign = { id: string; name: string };

export function AddToCampaignDialog({
  open,
  onOpenChange,
  campaigns,
  savedViewId,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  campaigns: Campaign[];
  savedViewId?: string;
}) {
  const [campaignId, setCampaignId] = React.useState<string>("");
  const [limit, setLimit] = React.useState<string>("1000");
  const [busy, setBusy] = React.useState(false);

  const reset = React.useCallback(() => {
    setCampaignId("");
    setLimit("1000");
    setBusy(false);
  }, []);

  React.useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  async function run() {
    if (!campaignId || !savedViewId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/add-saved-view`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ savedViewId, limit: Number(limit) }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to add leads");
      }
      toast.success(`Added ${json.added ?? 0} leads to campaign`);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || "Failed to add leads");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Campaign</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <div className="text-sm text-muted-foreground">Campaign</div>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder="Select campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <div className="text-sm text-muted-foreground">Max leads to add</div>
            <Input value={limit} onChange={(event) => setLimit(event.target.value)} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={run} disabled={!campaignId || !savedViewId || busy}>
              {busy ? "Adding..." : "Add Leads"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}



