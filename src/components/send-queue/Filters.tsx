"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

type Campaign = { id: string; name: string };

export default function QueueFilters({ campaigns }: { campaigns: Campaign[] }) {
  const sp = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState(sp.get("status") || "");
  const [campaignId, setCampaignId] = useState(sp.get("campaign") || "");
  const [from, setFrom] = useState(sp.get("from") || "");
  const [to, setTo] = useState(sp.get("to") || "");

  // keep UI in sync on client navs
  useEffect(() => {
    setStatus(sp.get("status") || "");
    setCampaignId(sp.get("campaign") || "");
    setFrom(sp.get("from") || "");
    setTo(sp.get("to") || "");
  }, [sp]);

  const onApply = () => {
    const params = new URLSearchParams(sp.toString());
    status ? params.set("status", status) : params.delete("status");
    campaignId ? params.set("campaign", campaignId) : params.delete("campaign");
    from ? params.set("from", from) : params.delete("from");
    to ? params.set("to", to) : params.delete("to");
    params.set("page", "1"); // reset pagination on new filters
    router.push(`?${params.toString()}`);
  };

  const onClear = () => {
    const params = new URLSearchParams();
    router.push(`?${params.toString()}`);
  };

  const statusOptions = useMemo(
    () => ["queued", "sending", "sent", "failed", "canceled"],
    []
  );

  return (
    <div className="sticky top-0 z-10 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="p-3 grid grid-cols-1 md:grid-cols-5 gap-3">
        {/* Status */}
        <div className="space-y-1">
          <div className="text-xs opacity-70">Status</div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Any</SelectItem>
              {statusOptions.map(s => (
                <SelectItem value={s} key={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Campaign */}
        <div className="space-y-1">
          <div className="text-xs opacity-70">Campaign</div>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="All campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {campaigns.map(c => (
                <SelectItem value={c.id} key={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* From */}
        <div className="space-y-1">
          <div className="text-xs opacity-70">From (date)</div>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl" />
        </div>

        {/* To */}
        <div className="space-y-1">
          <div className="text-xs opacity-70">To (date)</div>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl" />
        </div>

        {/* Actions */}
        <div className="flex items-end gap-2">
          <Button onClick={onApply} className="rounded-2xl w-full">Apply</Button>
          <Button variant="ghost" onClick={onClear} className="rounded-2xl w-full">Clear</Button>
        </div>
      </div>
    </div>
  );
}


