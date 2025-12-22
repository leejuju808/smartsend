"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { toast } from "sonner";

type Row = {
  id: string;
  campaign_id: string;
  campaign_name: string | null;
  lead_id: string;
  lead_email: string | null;
  status: "queued"|"sending"|"sent"|"failed"|"canceled";
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  updated_at: string;
};

export default function QueueTable({
  rows, page, pageSize, total, campaigns, initialFilters
}: {
  rows: Row[];
  page: number;
  pageSize: number;
  total: number;
  campaigns: { id: string; name: string }[];
  initialFilters: { status: string; campaignId: string; from: string; to: string };
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [status, setStatus] = React.useState(initialFilters.status);
  const [campaignId, setCampaign] = React.useState(initialFilters.campaignId);
  const [from, setFrom] = React.useState(initialFilters.from);
  const [to, setTo] = React.useState(initialFilters.to);

  const allOnPageChecked = rows.length > 0 && rows.every(r => selected[r.id]);
  const someChecked = rows.some(r => selected[r.id]);

  function updateQuery(next: Record<string,string|undefined>) {
    const params = new URLSearchParams(sp.toString());
    Object.entries(next).forEach(([k,v]) => {
      if (!v) params.delete(k); else params.set(k, v);
    });
    router.push(`?${params.toString()}`);
  }

  function applyFilters() {
    updateQuery({ status: status || undefined, campaignId: campaignId || undefined, from: from || undefined, to: to || undefined, page: "1" });
  }

  function toggleAllOnPage(checked: boolean) {
    const next: Record<string, boolean> = { ...selected };
    rows.forEach(r => next[r.id] = checked);
    setSelected(next);
  }

  async function actionRetry() {
    const ids = Object.keys(selected).filter(k => selected[k]);
    if (ids.length === 0) return;
    const res = await fetch("/api/queue/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queueIds: ids }) });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json?.error ?? "Retry failed");
      return;
    }
    const queued = (json.results as any[]).filter((r: any) => r.queued).length;
    const skipped = (json.results as any[]).filter((r: any) => r.skipped).length;
    toast.success(`Queued ${queued} • Skipped ${skipped}`);
    setSelected({});
    router.refresh();
  }

  async function actionCancel() {
    const ids = Object.keys(selected).filter(k => selected[k]);
    if (ids.length === 0) return;
    const res = await fetch("/api/queue/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queueIds: ids }) });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json?.error ?? "Cancel failed");
      return;
    }
    toast.message(`Canceled ${json.canceled?.length ?? 0} item(s)`);
    setSelected({});
    router.refresh();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="rounded-xl border p-3 sticky top-0 z-10 bg-background/80 backdrop-blur">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="sending">Sending</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={campaignId} onValueChange={setCampaign}>
            <SelectTrigger><SelectValue placeholder="Campaign" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All campaigns</SelectItem>
              {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { setStatus(""); setCampaign(""); setFrom(""); setTo(""); updateQuery({ status: undefined, campaignId: undefined, from: undefined, to: undefined, page: "1" }); }}>Reset</Button>
            <Button onClick={applyFilters}>Apply</Button>
          </div>
        </div>
      </div>

      {/* Bulk toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{total} total</div>
        {someChecked ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={actionRetry}>Retry Failed</Button>
            <Button size="sm" variant="destructive" onClick={actionCancel}>Cancel</Button>
          </div>
        ) : null}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 sticky top-0">
            <tr>
              <th className="p-2 w-10">
                <Checkbox checked={allOnPageChecked} onCheckedChange={(v: boolean) => toggleAllOnPage(Boolean(v))} />
              </th>
              <th className="p-2 text-left">Lead</th>
              <th className="p-2 text-left">Campaign</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Attempts</th>
              <th className="p-2 text-left">Last error</th>
              <th className="p-2 text-left">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t hover:bg-muted/20">
                <td className="p-2">
                  <Checkbox checked={!!selected[r.id]} onCheckedChange={(v: boolean) => setSelected(s => ({ ...s, [r.id]: Boolean(v) }))} />
                </td>
                <td className="p-2">{r.lead_email ?? "—"}</td>
                <td className="p-2">{r.campaign_name ?? "—"}</td>
                <td className="p-2 capitalize">{r.status}</td>
                <td className="p-2">{r.attempt_count}/{r.max_attempts}</td>
                <td className="p-2 text-xs text-muted-foreground max-w-[320px] truncate" title={r.last_error ?? ""}>{r.last_error ?? "—"}</td>
                <td className="p-2 text-xs">{new Date(r.updated_at).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No items match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Page {page} of {totalPages}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => updateQuery({ page: String(page - 1) })}>Prev</Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => updateQuery({ page: String(page + 1) })}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string)=>void }) {
  const [open, setOpen] = React.useState(false);
  const d = value ? new Date(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start font-normal">
          <span className="mr-2">{label}</span>
          {value ? format(new Date(value), "yyyy-MM-dd") : <span className="text-muted-foreground">Pick date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Calendar
          mode="single"
          selected={d}
          onSelect={(day: Date | undefined) => {
            onChange(day ? day.toISOString().slice(0,10) : "");
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}


