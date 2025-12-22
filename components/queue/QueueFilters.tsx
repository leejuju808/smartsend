"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  campaigns: { id: string; name: string }[];
  onChange: (f: { status?: string; campaignId?: string; start?: string; end?: string }) => void;
  initial?: { status?: string; campaignId?: string; start?: string; end?: string };
};

export function QueueFilters({ campaigns, onChange, initial }: Props) {
  const [status, setStatus] = React.useState(initial?.status ?? "");
  const [campaignId, setCampaignId] = React.useState(initial?.campaignId ?? "");
  const [start, setStart] = React.useState(initial?.start ?? "");
  const [end, setEnd] = React.useState(initial?.end ?? "");

  // Auto-apply on change
  React.useEffect(() => {
    onChange({
      status: status || undefined,
      campaignId: campaignId || undefined,
      start: start ? new Date(start).toISOString() : undefined,
      end: end ? new Date(end).toISOString() : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, campaignId, start, end]);

  function clearAll() {
    setStatus("");
    setCampaignId("");
    setStart("");
    setEnd("");
  }

  return (
    <div className="grid gap-3 md:grid-cols-5 items-end">
      <div>
        <Label>Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="sending">Sending</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="replied">Replied</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Campaign</Label>
        <Select value={campaignId} onValueChange={setCampaignId}>
          <SelectTrigger><SelectValue placeholder="All campaigns" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="">All</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Start</Label>
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>

      <div>
        <Label>End</Label>
        <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={clearAll} className="w-full">Reset</Button>
      </div>
    </div>
  );
}


