"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Lead = { id: string; email: string; status: string };

export default function E2ETesterPage() {
  const [campaignId, setCampaignId] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [picked, setPicked] = useState<string>("");

  async function refreshLeads() {
    if (!campaignId) return;
    const res = await fetch(`/api/leads/list?campaignId=${campaignId}&page=1&pageSize=50&status=all`);
    const json = await res.json();
    setLeads(json.rows ?? []);
  }

  useEffect(() => {
    refreshLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function processQueue() {
    if (!campaignId) return;
    const res = await fetch("/api/dev/sim/process-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, batchSize: 20 }),
    });
    await res.json();
    refreshLeads();
  }

  async function simulateReply() {
    if (!campaignId || !picked) return;
    const res = await fetch("/api/dev/sim/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, leadId: picked }),
    });
    await res.json();
    refreshLeads();
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">E2E Tester (Dev)</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Campaign ID" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="w-[360px]" />
        <Button variant="secondary" onClick={refreshLeads} disabled={!campaignId}>Refresh</Button>
        <Button onClick={processQueue} disabled={!campaignId}>Process Queue</Button>
      </div>
      <div className="flex items-center gap-2">
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger className="w-[360px]">
            <SelectValue placeholder="Pick a lead to mark replied" />
          </SelectTrigger>
          <SelectContent>
            {leads.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.email} — {l.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={simulateReply} disabled={!picked}>Mark Replied</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Flow: Import CSV → set campaignId → Refresh → Process Queue (queues → sent/failed) → pick a lead → Mark Replied.
      </p>
    </div>
  );
}


