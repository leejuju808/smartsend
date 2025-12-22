"use client";

import * as React from "react";
import { QueueTable, type QueueRow } from "@/components/queue/QueueTable";
import { QueueFilters } from "@/components/queue/QueueFilters";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";

type FilterState = { status?: string; campaignId?: string; start?: string; end?: string };

export default function QueueClient() {
  const [filters, setFilters] = React.useState<FilterState>({});
  const [rows, setRows] = React.useState<QueueRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [campaigns, setCampaigns] = React.useState<{ id: string; name: string }[]>([]);
  const [firstLoad, setFirstLoad] = React.useState(true);
  const skipInitialLoad = React.useRef(true);

  async function loadCampaigns() {
    try {
      const res = await fetch("/api/campaigns/list");
      if (!res.ok) throw new Error("Failed to load campaigns");
      const json = await res.json();
      setCampaigns(json.rows ?? []);
    } catch {
      setCampaigns([]);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filters.status) p.set("status", filters.status);
      if (filters.campaignId) p.set("campaignId", filters.campaignId);
      if (filters.start) p.set("start", filters.start);
      if (filters.end) p.set("end", filters.end);
      const res = await fetch(`/api/queue/search?${p.toString()}`);
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.message ?? "Failed");
      setRows(json.rows ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Load error");
      setRows([]);
    } finally {
      setLoading(false);
      setFirstLoad(false);
    }
  }

  React.useEffect(() => {
    loadCampaigns();
  }, []);
  
  React.useEffect(() => {
    // Skip the first filter change when component mounts to avoid double load
    if (skipInitialLoad.current) {
      skipInitialLoad.current = false;
      loadData();
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  function exportCsv() {
    const p = new URLSearchParams();
    if (filters.status) p.set("status", filters.status);
    if (filters.campaignId) p.set("campaignId", filters.campaignId);
    if (filters.start) p.set("start", filters.start);
    if (filters.end) p.set("end", filters.end);
    const url = `/api/queue/export?${p.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <QueueFilters campaigns={campaigns} onChange={setFilters} initial={filters} />
        <div className="flex justify-end">
          <button
            onClick={exportCsv}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Export CSV
          </button>
        </div>
      </div>

      {loading && firstLoad ? (
        <TableSkeleton rows={8} cols={7} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No queue items match your filters."
          subtitle="Try adjusting filters, or import leads to kick off a campaign."
          actionLabel="Go to Leads"
          onAction={() => (window.location.href = "/leads")}
          secondary={<button className="text-sm underline" onClick={() => setFilters({})}>Reset filters</button>}
        />
      ) : (
        <QueueTable data={rows} onRefetch={loadData} />
      )}
    </div>
  );
}


