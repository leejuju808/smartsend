"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

export default function ScheduleCampaignModal({ workspaceId }: { workspaceId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [statusFilter, setStatusFilter] = useState("new");
  const [rate, setRate] = useState(30);
  const [startAt, setStartAt] = useState<string>(new Date().toISOString().slice(0,16));

  async function schedule() {
    try {
      const iso = new Date(startAt).toISOString();
      const body = { workspace_id: workspaceId, campaign_id: campaignId, filter: { status: statusFilter }, start_at: iso, rate_per_minute: rate };
      const res = await fetch("/api/campaigns/schedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Schedule failed");
      toast({ title: "Scheduled", description: `${json.created} queued • ${json.skipped ?? 0} skipped` });
      setOpen(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Schedule failed", description: String(e.message || e) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Schedule Campaign</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Sends</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="text-xs mb-1">Campaign ID</div>
            <Input value={campaignId} onChange={(e) => setCampaignId(e.target.value)} placeholder="uuid" />
          </div>
          <div>
            <div className="text-xs mb-1">Target Leads</div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">All NEW</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs mb-1">Start time</div>
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
          <div>
            <div className="text-xs mb-1">Rate (emails per minute)</div>
            <Input type="number" min={1} max={600} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={schedule} disabled={!campaignId}>Schedule</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


