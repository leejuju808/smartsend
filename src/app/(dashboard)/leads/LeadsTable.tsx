"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

type Lead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  status: "new" | "queued" | "sending" | "sent" | "failed" | "replied";
  attempts: number;
  max_attempts: number;
  created_at: string;
  suppressed?: boolean;
  suppressed_reason?: string | null;
};

type Props = {
  campaignId: string;
};

const PAGE_SIZE = 25;

export default function LeadsTable({ campaignId }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const anySelected = useMemo(() => Object.values(selected).some(Boolean), [selected]);
  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([k]) => k), [selected]);

  async function fetchPage() {
    setLoading(true);
    setRows(null);
    try {
      const params: Record<string, string> = {
        campaignId,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      };
      if (status && status !== "all") params.status = status;
      if (query) params.search = query;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      
      const qs = new URLSearchParams(params);
      const res = await fetch(`/api/leads/list?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load leads");
      setRows(json.rows);
      setTotal(json.total);
      setSelected({});
    } catch (e: any) {
      toast({ title: "Load failed", description: e.message, variant: "destructive" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, dateFrom, dateTo]);

  function toggleAll(checked: boolean) {
    if (!rows) return;
    const next: Record<string, boolean> = {};
    for (const r of rows) {
      next[r.id] = checked && r.status === "failed";
    }
    setSelected(next);
  }

  async function onRetry() {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch("/api/leads/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Retry failed");
      toast({ title: "Retry queued", description: `Re-queued ${json.updated} lead(s).` });
      fetchPage();
    } catch (e: any) {
      toast({ title: "Retry error", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search email/company…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1);
              fetchPage();
            }
          }}
          className="w-[240px]"
        />
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="sending">Sending</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="replied">Replied</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
        <Button variant="secondary" onClick={() => { setPage(1); fetchPage(); }}>Apply</Button>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            onClick={onRetry}
            disabled={!anySelected}
            title={!anySelected ? "Select failed rows first" : "Retry failed"}
          >
            Retry Failed
          </Button>
        </div>
      </div>

      <div className="rounded-xl border">
        <div className="grid grid-cols-6 items-center border-b p-3 sticky top-0 bg-background">
          <div className="flex items-center gap-2">
            <Checkbox
              onCheckedChange={(v) => toggleAll(Boolean(v))}
              checked={rows ? rows.every(r => selected[r.id]) && rows.length > 0 : false}
            />
            <span className="text-sm text-muted-foreground">Select</span>
          </div>
          <Header>Lead</Header>
          <Header>Company</Header>
          <Header>Status</Header>
          <Header>Attempts</Header>
          <Header>Created</Header>
        </div>

        {loading && (
          <div className="p-6 text-sm text-muted-foreground">Loading leads…</div>
        )}

        {!loading && rows && rows.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No leads yet. Import a CSV to get started.</div>
        )}

        {!loading && rows && rows.map((r) => (
          <div key={r.id} className="grid grid-cols-6 items-center border-b p-3">
            <div>
              <Checkbox
                checked={!!selected[r.id]}
                onCheckedChange={(v) => setSelected(s => ({ ...s, [r.id]: Boolean(v) }))}
                disabled={r.status !== "failed"}
              />
            </div>
            <Cell>
              <div className="font-medium">{r.email}</div>
              <div className="text-xs text-muted-foreground">
                {(r.first_name || r.last_name) ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() : ""}
              </div>
            </Cell>
            <Cell>{r.company ?? "-"}</Cell>
            <Cell className={r.status === "failed" ? "text-red-600" : r.status === "replied" ? "text-green-600" : ""}>
              <div className="flex items-center gap-2">
                <span>{r.status}</span>
                {r.suppressed && (
                  <span
                    className="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded-full"
                    title={r.suppressed_reason || "Suppressed"}
                  >
                    Suppressed
                  </span>
                )}
              </div>
            </Cell>
            <Cell>{r.attempts}/{r.max_attempts}</Cell>
            <Cell>{new Date(r.created_at).toLocaleDateString()}</Cell>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Page {page} · {Intl.NumberFormat().format(total)} total
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page * PAGE_SIZE) >= total}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-muted-foreground">{children}</div>;
}
function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-sm ${className ?? ""}`}>{children}</div>;
}


