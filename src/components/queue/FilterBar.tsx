"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Filters = {
  status: string;
  campaignId: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
};

export function FilterBar({
  campaigns,
  value,
  onChange,
  onRefresh,
}: {
  campaigns: { id: string; name: string }[];
  value: Filters;
  onChange: (f: Filters) => void;
  onRefresh: () => void;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });

  return (
    <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="grid gap-3 p-3 md:grid-cols-12">
        <div className="md:col-span-3">
          <Label>Status</Label>
          <Select value={value.status} onValueChange={(v) => set({ status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="sending">Sending</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="replied">Replied</SelectItem>
              <SelectItem value="new">New</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-3">
          <Label>Campaign</Label>
          <Select value={value.campaignId} onValueChange={(v) => set({ campaignId: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2">
          <Label>From</Label>
          <Input type="date" value={value.dateFrom ?? ""} onChange={(e) => set({ dateFrom: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <Label>To</Label>
          <Input type="date" value={value.dateTo ?? ""} onChange={(e) => set({ dateTo: e.target.value })} />
        </div>

        <div className="md:col-span-2">
          <Label>Search</Label>
          <Input placeholder="email or company" value={value.q ?? ""} onChange={(e) => set({ q: e.target.value })} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 px-3 pb-3">
        <Button variant="secondary" onClick={() => onChange({ status: "all", campaignId: "all", dateFrom: "", dateTo: "", q: "" })}>Reset</Button>
        <Button onClick={onRefresh}>Apply</Button>
      </div>
    </div>
  );
}


