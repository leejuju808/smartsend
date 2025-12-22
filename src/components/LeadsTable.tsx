"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

interface Lead { 
  id: string; 
  email: string; 
  first_name: string | null; 
  last_name: string | null; 
  company: string | null; 
  status: string; 
  campaign_id: string | null; 
  created_at: string;
  opens?: number;
  clicks?: number;
}

// Hook to fetch engagement counts for visible leads
function useEngagement(rows: Lead[], setRows: (rows: Lead[]) => void) {
  useEffect(() => {
    const ids = rows.map(r => r.id);
    if (ids.length === 0) return;

    (async () => {
      try {
        const res = await fetch("/api/leads/engagement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_ids: ids })
        });

        const json = await res.json();
        if (!res.ok) return;

        const map = new Map<string, {opens:number;clicks:number}>(
          json.map((r:any) => [r.lead_id, {opens:r.opens || 0, clicks:r.clicks || 0}])
        );

        setRows(rows.map(r => ({ ...r, ...(map.get(r.id) ?? {opens: 0, clicks: 0}) })));
      } catch (error) {
        console.error("Failed to fetch engagement:", error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map(r => r.id).join(",")]);
}

export default function LeadsTable() {
  const { toast } = useToast();
  const [status, setStatus] = useState<string | undefined>();
  const [campaignId, setCampaignId] = useState<string | undefined>();
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Use engagement hook to fetch opens/clicks
  useEngagement(data, setData);

  const allChecked = useMemo(() => data.length > 0 && data.every((d) => selected[d.id]), [data, selected]);
  const anyChecked = useMemo(() => Object.values(selected).some(Boolean), [selected]);

  async function fetchData() {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (status) qs.set("status", status);
    if (campaignId) qs.set("campaign_id", campaignId);
    if (dateFrom) qs.set("date_from", dateFrom);
    if (dateTo) qs.set("date_to", dateTo);
    const res = await fetch(`/api/leads/query?${qs.toString()}`);
    const json = await res.json();
    if (res.ok) {
      setData(json.data);
      setTotal(json.total);
      setSelected({});
    }
    setLoading(false);
  }

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [status, campaignId, dateFrom, dateTo, page, pageSize]);

  function toggleAll(checked: boolean) {
    if (!checked) return setSelected({});
    const next: Record<string, boolean> = {};
    data.forEach((d) => { next[d.id] = true; });
    setSelected(next);
  }

  async function retrySelected() {
    const lead_ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (lead_ids.length === 0) return;
    const res = await fetch("/api/queue/retry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead_ids }) });
    const json = await res.json();
    if (!res.ok) return toast({ variant: "destructive", title: "Retry failed", description: json.error || "Unknown error" });
    toast({ title: "Retry queued", description: `${json.updated} updated • ${json.skipped} skipped` });
    fetchData();
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2 sticky top-0 bg-background/80 backdrop-blur z-10 p-2 rounded">
        <div className="w-40">
          <div className="text-xs mb-1">Status</div>
          <Select value={status} onValueChange={(v) => setStatus(v)}>
            <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="new">new</SelectItem>
              <SelectItem value="queued">queued</SelectItem>
              <SelectItem value="sending">sending</SelectItem>
              <SelectItem value="sent">sent</SelectItem>
              <SelectItem value="failed">failed</SelectItem>
              <SelectItem value="replied">replied</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <div className="text-xs mb-1">Campaign</div>
          <Input placeholder="campaign_id" value={campaignId ?? ""} onChange={(e) => setCampaignId(e.target.value || undefined)} />
        </div>
        <div>
          <div className="text-xs mb-1">Date from</div>
          <Input type="date" value={dateFrom ?? ""} onChange={(e) => setDateFrom(e.target.value || undefined)} />
        </div>
        <div>
          <div className="text-xs mb-1">Date to</div>
          <Input type="date" value={dateTo ?? ""} onChange={(e) => setDateTo(e.target.value || undefined)} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={() => { setStatus(undefined); setCampaignId(undefined); setDateFrom(undefined); setDateTo(undefined); }}>Reset</Button>
          <Button onClick={fetchData}>Apply</Button>
        </div>
      </div>

      {/* Bulk toolbar */}
      {anyChecked && (
        <div className="flex items-center gap-2 p-2 border rounded bg-muted/40">
          <div className="text-sm">{Object.values(selected).filter(Boolean).length} selected</div>
          <Button size="sm" onClick={retrySelected}>Retry failed</Button>
        </div>
      )}

      {/* Table */}
      <div className="border rounded overflow-hidden">
        <div className="grid grid-cols-10 gap-2 p-2 bg-muted text-xs font-medium items-center">
          <div className="flex items-center gap-2"><Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(Boolean(v))} /> Select</div>
          <div>Email</div>
          <div>First</div>
          <div>Last</div>
          <div>Company</div>
          <div>Status</div>
          <div>Campaign</div>
          <div>Opens</div>
          <div>Clicks</div>
          <div>Created</div>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm">Loading…</div>
        ) : data.length === 0 ? (
          <div className="p-6 text-center text-sm">No leads match your filters.</div>
        ) : (
          data.map((d) => (
            <div key={d.id} className="grid grid-cols-10 gap-2 p-2 border-t items-center">
              <div><Checkbox checked={!!selected[d.id]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [d.id]: Boolean(v) }))} /></div>
              <div className="truncate">{d.email}</div>
              <div className="truncate">{d.first_name ?? ""}</div>
              <div className="truncate">{d.last_name ?? ""}</div>
              <div className="truncate">{d.company ?? ""}</div>
              <div className="truncate">{d.status}</div>
              <div className="truncate">{d.campaign_id ?? "—"}</div>
              <div className="truncate">{d.opens ?? 0}</div>
              <div className="truncate">{d.clicks ?? 0}</div>
              <div className="truncate">{new Date(d.created_at).toLocaleString()}</div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-2 justify-end">
        <div className="text-sm">{(total === 0) ? 0 : ( (page - 1) * pageSize + 1)}–{Math.min(page * pageSize, total)} of {total}</div>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[10,25,50,100].map((n) => (<SelectItem key={n} value={String(n)}>{n} / page</SelectItem>))}
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
        <Button variant="outline" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
    </div>
  );
}

"use client";
import * as React from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { StatusBadge } from "./StatusBadge";

export type Lead = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  thread_id?: string | null;
  status: "new" | "queued" | "sent" | "bounced" | "replied";
  created_at: string;
};

export default function LeadsTable({ initial }: { initial: Lead[] }) {
  const [rows, setRows] = React.useState<Lead[]>(initial);
  const sb = React.useMemo(() => supabaseBrowser(), []);

  React.useEffect(() => {
    const channel = sb
      .channel("leads-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads" },
        (payload) => {
          const updated = payload.new as Lead;
          setRows((prev) =>
            prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
          );
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [sb]);

  return (
    <div className="w-full overflow-auto rounded-2xl border border-zinc-200">
      <table className="min-w-full bg-white">
        <thead className="bg-zinc-50 text-left text-sm">
          <tr>
            <th className="px-4 py-3">Lead</th>
            <th className="px-4 py-3">Company</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Added</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-4 py-3">
                <div className="font-medium">{r.email}</div>
                <div className="text-zinc-500">
                  {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                </div>
              </td>
              <td className="px-4 py-3">{r.company || "—"}</td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-3">
                {new Date(r.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 