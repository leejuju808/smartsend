"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

type Props = {
  initial: { status?: string | null; campaignId?: string | null; from?: string | null; to?: string | null; };
  onApply: (q: { status?: string | null; campaignId?: string | null; from?: string | null; to?: string | null; page?: number; }) => void;
  campaigns?: Array<{ id: string; name: string }>;
};

export default function LeadsFilters({ initial, onApply, campaigns = [] }: Props) {
  const [status, setStatus] = useState<string | undefined>(initial.status || undefined);
  const [campaignId, setCampaignId] = useState<string | undefined>(initial.campaignId || undefined);
  const [from, setFrom] = useState<string | undefined>(initial.from || undefined);
  const [to, setTo] = useState<string | undefined>(initial.to || undefined);

  return (
    <div className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger><SelectValue placeholder="Campaign" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="w-40">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="sending">Sending</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="replied">Replied</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Input type="date" value={from || ""} onChange={(e) => setFrom(e.target.value || undefined)} className="w-40" />
          <span className="opacity-60">to</span>
          <Input type="date" value={to || ""} onChange={(e) => setTo(e.target.value || undefined)} className="w-40" />
        </div>

        <Button
          onClick={() => onApply({ status: status || null, campaignId: campaignId || null, from: from || null, to: to || null, page: 1 })}
        >
          Apply
        </Button>

        <Button variant="outline" onClick={() => { setStatus(undefined); setCampaignId(undefined); setFrom(undefined); setTo(undefined); onApply({ status: null, campaignId: null, from: null, to: null, page: 1 }); }}>
          Reset
        </Button>
      </div>
    </div>
  );
}


