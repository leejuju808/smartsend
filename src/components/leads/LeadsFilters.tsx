"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Campaign = { id: string; name: string };
export default function LeadsFilters({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const sp = useSearchParams();

  const status = sp.get("status") ?? "";
  const campaignId = sp.get("campaignId") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (!v) next.delete(k); else next.set(k, v);
    router.replace(`?${next.toString()}`);
  };

  const reset = () => router.replace("?");

  const statusOptions = useMemo(
    () => ["", "queued", "sending", "sent", "failed", "replied"],
    []
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      <div className="space-y-1">
        <Label>Status</Label>
        <Select value={status} onValueChange={(v) => setParam("status", v)}>
          <SelectTrigger><SelectValue placeholder="Any status" /></SelectTrigger>
          <SelectContent>
            {statusOptions.map((s) => (
              <SelectItem key={s || "any"} value={s}>{s || "Any"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Campaign</Label>
        <Select value={campaignId} onValueChange={(v) => setParam("campaignId", v)}>
          <SelectTrigger><SelectValue placeholder="All campaigns" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>From</Label>
        <Input type="date" value={from} onChange={(e) => setParam("from", e.target.value ? new Date(e.target.value).toISOString() : "")} />
      </div>

      <div className="space-y-1">
        <Label>To</Label>
        <Input type="date" value={to ? new Date(to).toISOString().slice(0,10) : ""} onChange={(e) => setParam("to", e.target.value ? new Date(e.target.value).toISOString() : "")} />
      </div>

      <div className="flex items-end">
        <Button variant="secondary" className="w-full" onClick={reset}>Reset</Button>
      </div>
    </div>
  );
}


