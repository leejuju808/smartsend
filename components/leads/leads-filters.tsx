"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

export function LeadsFilters({
  campaigns,
}: {
  campaigns: { id: string; name: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [campaignId, setCampaignId] = useState(sp.get("campaign") ?? "");
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  useEffect(() => {
    setStatus(sp.get("status") ?? "");
    setCampaignId(sp.get("campaign") ?? "");
    setFrom(sp.get("from") ?? "");
    setTo(sp.get("to") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.toString()]);

  const apply = () => {
    const params = new URLSearchParams(sp.toString());
    status ? params.set("status", status) : params.delete("status");
    campaignId ? params.set("campaign", campaignId) : params.delete("campaign");
    from ? params.set("from", from) : params.delete("from");
    to ? params.set("to", to) : params.delete("to");
    params.delete("page");
    router.push(`?${params.toString()}`);
  };

  const clearAll = () => {
    router.push("?");
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      <div className="space-y-1">
        <Label>Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            {["new","queued","sending","sent","failed","replied"].map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Campaign</Label>
        <Select value={campaignId} onValueChange={setCampaignId}>
          <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>From</Label>
        <Input type="date" value={from} onChange={e=>setFrom(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>To</Label>
        <Input type="date" value={to} onChange={e=>setTo(e.target.value)} />
      </div>

      <div className="flex items-end gap-2">
        <Button onClick={apply}>Apply</Button>
        <Button variant="outline" onClick={clearAll}>Clear</Button>
      </div>
    </div>
  );
}


