"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type Log = {
  id: string;
  created_at: string;
  event_type: string;
  lead_id: string | null;
  meta: Record<string, any> | null;
};

const TYPES = [
  { v: "all", label: "All" },
  { v: "queued", label: "Queued" },
  { v: "sending", label: "Sending" },
  { v: "sent", label: "Sent" },
  { v: "failed", label: "Failed" },
  { v: "retry_queued", label: "Retry" },
  { v: "replied", label: "Replied" },
  { v: "throttle", label: "Throttled" },
];

export function ActivityFeed({ campaignId }: { campaignId: string }) {
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Log[] | null>(null);
  const [total, setTotal] = useState(0);
  const pageSize = 30;

  async function load() {
    const qs = new URLSearchParams({
      campaignId,
      type,
      page: String(page),
      pageSize: String(pageSize),
    });
    const res = await fetch(`/api/activity/list?${qs.toString()}`);
    const json = await res.json();
    if (res.ok) {
      setRows(json.rows || []);
      setTotal(json.total || 0);
    } else {
      setRows([]);
      setTotal(0);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [type, page, campaignId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Activity</div>
        <div className="flex items-center gap-2">
          <Select value={type} onValueChange={(v)=>{ setType(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              {TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-2xl border divide-y">
        {(rows ?? []).map((r) => (
          <div key={r.id} className="p-3 text-sm flex items-start gap-3">
            <Badge type={r.event_type} />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="font-medium capitalize">{labelFor(r.event_type)}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {renderMeta(r)}
              </div>
            </div>
          </div>
        ))}

        {!rows?.length && <div className="p-4 text-sm text-muted-foreground">No activity yet.</div>}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Page {page} · {Intl.NumberFormat().format(total)} events
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>Prev</Button>
          <Button variant="outline" size="sm" onClick={()=>setPage(p=>p+1)} disabled={(page*pageSize) >= total}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function labelFor(t: string) {
  switch (t) {
    case "retry_queued": return "Retry Queued";
    case "throttle": return "Throttled (Send Cap)";
    default: return t;
  }
}

function renderMeta(r: Log) {
  const m = r.meta || {};
  if (r.event_type === "throttle") {
    return `Daily used: ${m.daily_used ?? "-"} / cap ${m.caps?.daily ?? "-"} · Monthly used: ${m.monthly_used ?? "-"} / cap ${m.caps?.monthly ?? "-"}`;
  }
  if (r.event_type === "replied") {
    const conf = m.ai_confidence != null ? ` (AI ${Math.round((m.ai_confidence as number) * 100)}%)` : "";
    return `Lead: ${r.lead_id ?? "-"} marked replied${conf}`;
  }
  if (r.event_type === "failed") {
    return `Lead: ${r.lead_id ?? "-"} failed${m.reason ? ` (${m.reason})` : ""}`;
  }
  if (r.event_type === "queued" || r.event_type === "sending" || r.event_type === "sent") {
    return `Lead: ${r.lead_id ?? "-"}`;
  }
  if (r.event_type === "retry_queued") {
    return `Lead: ${r.lead_id ?? "-"} re-enqueued`;
  }
  return JSON.stringify(m);
}

function Badge({ type }: { type: string }) {
  const color =
    type === "replied" ? "bg-emerald-100 text-emerald-800"
  : type === "failed"  ? "bg-red-100 text-red-800"
  : type === "throttle"? "bg-amber-100 text-amber-800"
  : type === "sent"    ? "bg-blue-100 text-blue-800"
  : type === "queued"  ? "bg-slate-100 text-slate-800"
  : type === "sending" ? "bg-indigo-100 text-indigo-800"
  : "bg-slate-100 text-slate-800";
  return <span className={`text-xs px-2 py-1 rounded-md ${color}`}>{labelFor(type)}</span>;
}

export default ActivityFeed;