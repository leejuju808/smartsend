"use client";

import * as React from "react";
import { FilterBar, type Filters } from "@/components/queue/FilterBar";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { SelectionToolbar } from "/Users/juju/smartsend-ai/components/queue/SelectionToolbar";
import { Button } from "@/components/ui/Button";

type Row = {
  id: string;
  campaign_id: string;
  lead_id: string;
  status: string;
  attempt_count: number | null;
  max_attempts: number | null;
  updated_at: string;
  email?: string | null;
  company?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export default function QueuePage() {
  const [filters, setFilters] = React.useState<Filters>({
    status: "all",
    campaignId: "all",
    dateFrom: "",
    dateTo: "",
    q: "",
  });
  const [campaigns, setCampaigns] = React.useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [total, setTotal] = React.useState(0);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchCampaigns = React.useCallback(async () => {
    const res = await fetch("/api/campaigns/list");
    if (res.ok) {
      const j = await res.json();
      setCampaigns([{ id: "all", name: "All" }, ...(j.rows ?? [])]);
    } else {
      setCampaigns([{ id: "all", name: "All" }]);
    }
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      status: filters.status,
      campaignId: filters.campaignId,
    });
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom!);
    if (filters.dateTo) params.set("dateTo", filters.dateTo!);
    if (filters.q) params.set("q", filters.q!);

    const res = await fetch(`/api/queue/list?${params.toString()}`);
    const j = await res.json();
    setLoading(false);

    if (!res.ok) {
      setRows([]);
      setTotal(0);
      return;
    }
    setRows(j.rows ?? []);
    setTotal(j.total ?? 0);
    setSelectedIds([]);
  }, [filters, page, pageSize]);

  React.useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);
  React.useEffect(() => {
    load();
  }, [load]);

  const selectedItems = React.useMemo(
    () =>
      rows
        .filter((r) => selectedIds.includes(r.id))
        .map((r) => ({
          id: r.id,
          status: r.status,
          attempt_count: r.attempt_count ?? 0,
          max_attempts: r.max_attempts ?? 3,
        })),
    [rows, selectedIds]
  );

  return (
    <div className="space-y-3">
      <FilterBar
        campaigns={campaigns.filter((c) => c.id !== "all")}
        value={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
        onRefresh={load}
      />

      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState title="No jobs found" subtitle="Try changing your filters or date range." />
      ) : (
        <div className="rounded-2xl border">
          <div className="sticky top-[64px] z-10 grid grid-cols-12 border-b bg-background/90 p-2 text-xs font-medium uppercase tracking-wide">
            <div className="col-span-1">Select</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-2">Company</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Attempts</div>
            <div className="col-span-2">Updated</div>
          </div>
          <div>
            {rows.map((r) => {
              const selected = selectedIds.includes(r.id);
              const canRetry = r.status === "failed" && (r.attempt_count ?? 0) < (r.max_attempts ?? 3);
              return (
                <div key={r.id} className="grid grid-cols-12 items-center border-b p-2 text-sm">
                  <div className="col-span-1">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded"
                      checked={selected}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedIds((prev) => (checked ? [...new Set([...prev, r.id])] : prev.filter((id) => id !== r.id)));
                      }}
                      disabled={!canRetry}
                      aria-label="Select row"
                    />
                  </div>
                  <div className="col-span-3 truncate">{r.email ?? "—"}</div>
                  <div className="col-span-2 truncate">{r.company ?? "—"}</div>
                  <div className="col-span-2">{r.status}</div>
                  <div className="col-span-2">{(r.attempt_count ?? 0)}/{(r.max_attempts ?? 3)}</div>
                  <div className="col-span-2">{new Date(r.updated_at).toLocaleString()}</div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between p-2">
            <div className="text-sm text-muted-foreground">{total} total • Page {page} of {totalPages}</div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Prev
              </Button>
              <Button variant="secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next
              </Button>
              <select
                className="rounded-md border px-2 py-1 text-sm"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}/page
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <SelectionToolbar
        selected={selectedItems}
        onCleared={() => setSelectedIds([])}
        onRefetch={load}
      />
    </div>
  );
}


