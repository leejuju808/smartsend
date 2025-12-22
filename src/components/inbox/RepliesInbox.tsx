"use client";

import useSWR from "swr";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const fetcher = (u:string)=>fetch(u).then(r=>r.json());

const LABELS = ["positive","neutral","negative","unsubscribe","ooo","bounce","other"] as const;

type ThreadRow = {
  thread_id: string;
  subject: string | null;
  updated_at: string;
  stopped_by_reply: boolean | null;
  replied_at: string | null;
  last_inbound_at: string | null;
  last_label: string | null;
  lead_email: string | null;
};

export default function RepliesInbox({ campaignId }: { campaignId: string }) {
  const [q, setQ] = useState("");
  const [label, setLabel] = useState<string>("all");
  const { data, mutate } = useSWR(
    `/api/inbox?campaign=${campaignId}&q=${encodeURIComponent(q)}&label=${label}`,
    fetcher,
    { refreshInterval: 10000 }
  );

  const rows = (data?.rows ?? []) as ThreadRow[];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search email, name, subject, text…"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
        />
        <Select value={label} onValueChange={setLabel}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Label" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All labels</SelectItem>
            {LABELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        {rows.map((r)=>(
          <Card key={r.thread_id} className="p-3 flex items-start justify-between">
            <div className="space-y-1">
              <div className="text-sm font-semibold">
                {r.lead_email ?? "(unknown)"}{" "}
                <span className="text-muted-foreground font-normal">
                  · {new Date(r.last_inbound_at ?? r.updated_at).toLocaleString()}
                </span>
              </div>
              <div className="text-sm text-muted-foreground line-clamp-2">
                {r.subject ?? "(no subject)"}
              </div>
              <div className="text-xs opacity-60 mt-1">
                {r.last_label ? `AI: ${r.last_label}` : ""}
                {r.replied_at ? " • replied" : ""}
                {r.stopped_by_reply ? " • paused" : ""}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={()=>openReply(r.thread_id)}>
                Quick reply
              </Button>
              {r.stopped_by_reply && (
                <Button size="sm" onClick={()=>resume(r.thread_id, false)}>
                  Resume
                </Button>
              )}
            </div>
          </Card>
        ))}
        {rows.length === 0 && (
          <div className="text-sm text-muted-foreground p-6 text-center">No threads yet.</div>
        )}
      </div>
    </div>
  );
}

async function resume(threadId:string, enqueue:boolean) {
  await fetch("/functions/v1/resume-thread", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify({ thread_id: threadId, enqueue_next: enqueue })
  });
  // caller will refresh via SWR mutate if needed
}

function openReply(threadId:string) {
  const ev = new CustomEvent("openQuickReply", { detail: { threadId } });
  window.dispatchEvent(ev);
}

