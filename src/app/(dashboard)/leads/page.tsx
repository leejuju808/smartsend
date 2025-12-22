"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast/ToastProvider";
import { ImportJobs } from "@/components/leads/ImportJobs";

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  company: string | null;
  status: "new" | "queued" | "sent" | "Replied" | "Bounced" | "Archived";
  updated_at: string | null;
};

type Campaign = {
  id: string;
  name: string;
};

export default function LeadsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"any" | "Replied" | "NotReplied">("any");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [campaignId, setCampaignId] = useState<string>("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchRows = async () => {
    setLoading(true);
    const url = new URL("/api/leads/list", location.origin);
    url.searchParams.set("q", q);
    url.searchParams.set("status", status);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", "50");

    try {
      const r = await fetch(url);
      const j = await r.json();
      setRows(j.rows || []);
      setTotal(j.total || 0);
      setSelected({});
    } catch (err) {
      console.error("Error fetching leads:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const r = await fetch("/api/campaigns/list");
      const j = await r.json();
      setCampaigns(j.rows || []);
    } catch (err) {
      console.error("Error fetching campaigns:", err);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, page]);

  const allChecked = useMemo(() => rows.length > 0 && rows.every((r) => selected[r.id]), [rows, selected]);
  
  const toggleAll = (checked: boolean) => {
    const copy: Record<string, boolean> = {};
    if (checked) rows.forEach((r) => (copy[r.id] = true));
    setSelected(copy);
  };
  
  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  const addToCampaign = async () => {
    if (!campaignId || selectedIds.length === 0) {
      addToast({
        variant: "error",
        title: "Error",
        description: "Pick a campaign and select leads.",
      });
      return;
    }
    
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/add-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedIds }),
      });
      const j = await r.json();
      
      if (j.ok) {
        addToast({
          variant: "success",
          title: `Added ${selectedIds.length} to campaign`,
          description: `Total now ${j.count}. `,
        });
        setSelected({});
      } else {
        addToast({
          variant: "error",
          title: "Error",
          description: j.error || "Failed to add leads",
        });
      }
    } catch (err) {
      addToast({
        variant: "error",
        title: "Error",
        description: "Failed to add leads to campaign",
      });
      console.error(err);
    }
  };

  const pages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <div className="flex items-center gap-2">
          <input
            className="h-9 rounded-md border px-3 text-sm w-72"
            placeholder="Search email, name, company…"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
          />
          <select
            className="h-9 rounded-md border px-2 text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as any);
            }}
          >
            <option value="any">All</option>
            <option value="Replied">Replied</option>
            <option value="NotReplied">Not Replied</option>
          </select>
          <select
            className="h-9 rounded-md border px-2 text-sm"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="">Select campaign…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            className="rounded-xl border px-3 py-1.5 text-sm"
            onClick={addToCampaign}
            disabled={!campaignId || selectedIds.length === 0}
          >
            Add {selectedIds.length || ""} to Campaign
          </button>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2 text-sm font-medium bg-muted">
          <div className="col-span-1">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={(e) => toggleAll(e.target.checked)}
            />
          </div>
          <div className="col-span-3">Lead</div>
          <div className="col-span-3">Company</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-2">Status</div>
        </div>

        {loading && <div className="p-6 text-sm opacity-70">Loading...</div>}

        {!loading && rows.map((r) => (
          <div key={r.id} className="grid grid-cols-12 px-4 py-3 border-t hover:bg-muted/50">
            <div className="col-span-1 flex items-center">
              <input
                type="checkbox"
                checked={!!selected[r.id]}
                onChange={(e) => setSelected((prev) => ({ ...prev, [r.id]: e.target.checked }))}
              />
            </div>
            <div className="col-span-3">
              <div className="font-medium">
                {[r.first_name, r.last_name].filter(Boolean).join(" ") || r.email.split("@")[0]}
              </div>
              <div className="text-xs opacity-70">
                {new Date(r.updated_at || Date.now()).toLocaleString()}
              </div>
            </div>
            <div className="col-span-3">{r.company || "—"}</div>
            <div className="col-span-3 truncate">{r.email}</div>
            <div className="col-span-2">
              <span
                className={`text-xs rounded-full border px-2 py-0.5 ${
                  r.status === "Replied" ? "bg-green-100" : "bg-muted"
                }`}
              >
                {r.status}
              </span>
            </div>
          </div>
        ))}

        {!loading && rows.length === 0 && (
          <div className="p-6 text-sm opacity-70">No leads found.</div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="text-sm opacity-70">Total: {total}</div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border px-2 py-1 text-sm disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <div className="text-sm">
            {page} / {pages}
          </div>
          <button
            className="rounded-md border px-2 py-1 text-sm disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
          >
            Next
          </button>
        </div>
      </div>

      <ImportJobs />
    </div>
  );
}
