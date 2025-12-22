// components/dashboard/LeadsTable.tsx
"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { StatusBadge } from "@/components/StatusBadge";
import LoadingButton from "@/components/ui/LoadingButton";
import { PipelineStageBadge } from "@/components/ui/PipelineStageBadge";
import { toast } from "sonner";

export type Lead = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  location?: string | null;
  linkedin?: string | null;
  summary?: string | null;
  thread_id?: string | null;
  status: "new" | "queued" | "sent" | "bounced" | "replied" | "failed" | "retrying" | "paused";
  attempts?: number;
  max_attempts?: number;
  created_at: string;
  updated_at?: string;
  campaign_id?: string | null;
  last_reply_at?: string | null;
  reply_excerpt?: string | null;
  pipeline_stage?: string | null;
};

export default function LeadsTable({ leads }: { leads: Lead[] }) {
  const [rows, setRows] = React.useState<Lead[]>(leads);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [retryBusy, setRetryBusy] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const sb = React.useMemo(() => supabaseBrowser(), []);

  React.useEffect(() => {
    setRows(leads);
  }, [leads]);

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

  // Derive eligible failed leads (status='failed' and attempts < max_attempts)
  const eligibleLeads = useMemo(
    () =>
      (rows || []).filter(
        (l: Lead) =>
          l.status === "failed" &&
          (l.attempts ?? 0) < (l.max_attempts ?? 3)
      ),
    [rows]
  );

  const eligibleIds = useMemo(() => eligibleLeads.map((l) => l.id), [eligibleLeads]);

  const toggleSelectAll = () => {
    const allIds = rows.map((r) => r.id);
    const allSelected = allIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allIds);
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleRetrySelected = async () => {
    const idsToRetry = selectedIds.filter((id) => eligibleIds.includes(id));
    if (idsToRetry.length === 0) return;

    try {
      setRetryBusy(true);
      const res = await fetch("/api/retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: idsToRetry }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error || "Retry failed");
      }

      const data = await res.json();
      const queuedCount = data.result?.filter((r: any) => r.queued).length ?? 0;

      // Clear selection
      setSelectedIds([]);
      toast.success(`Re-enqueued ${queuedCount} lead(s).`);
    } catch (error: any) {
      console.error("Failed to retry leads:", error);
      toast.error(error.message || "Failed to queue leads for retry");
    } finally {
      setRetryBusy(false);
    }
  };

  const handleEnrichSelected = async () => {
    if (selectedIds.length === 0) return;

    try {
      setEnrichBusy(true);
      toast.loading(`Enriching ${selectedIds.length} lead(s)...`);

      const { data, error } = await sb.functions.invoke("enrich-leads", {
        body: { lead_ids: selectedIds },
      });

      if (error) {
        throw new Error(error.message || "Enrichment failed");
      }

      // Clear selection
      setSelectedIds([]);
      toast.success(`✅ Enriched ${data?.enriched || 0} lead(s)!`);
      
      if (data?.failed && data.failed > 0) {
        toast.warning(`${data.failed} lead(s) could not be enriched`);
      }
    } catch (error: any) {
      console.error("Failed to enrich leads:", error);
      toast.error(error.message || "Failed to enrich leads");
    } finally {
      setEnrichBusy(false);
    }
  };

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(r.id));

  return (
    <>
      {/* Selection toolbar */}
      {selectedIds.length > 0 && (
        <div className="sticky bottom-4 left-1/2 z-40 mx-auto w-max -translate-x-1/2 rounded-2xl border bg-background/80 px-4 py-2 shadow-lg backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="text-sm opacity-70">{selectedIds.length} selected</span>
            <LoadingButton
              loading={enrichBusy}
              onClick={handleEnrichSelected}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              ✨ Enrich Selected
            </LoadingButton>
            <LoadingButton
              loading={retryBusy}
              onClick={handleRetrySelected}
              disabled={selectedIds.filter((id) => eligibleIds.includes(id)).length === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Retry Failed
            </LoadingButton>
          </div>
        </div>
      )}

      <div className="w-full overflow-auto rounded-2xl border border-zinc-200">
        <table className="min-w-full bg-white">
          <thead className="bg-zinc-50 text-left text-sm">
            <tr>
              <th className="px-4 py-3 w-12">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  disabled={rows.length === 0}
                  className="cursor-pointer disabled:opacity-50"
                  aria-label="Select all leads"
                />
              </th>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Pipeline Stage</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Added</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {rows.map((r) => {
              const isEligible = r.status === "failed" && (r.attempts ?? 0) < (r.max_attempts ?? 3);
              const attempts = r.attempts ?? 0;
              const maxAttempts = r.max_attempts ?? 3;
              
              return (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(r.id)}
                      onChange={() => toggleSelectRow(r.id)}
                      className="cursor-pointer disabled:opacity-50"
                      aria-label={`Select ${r.email}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.email}</div>
                    <div className="text-zinc-500">
                      {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">{r.company || "—"}</td>
                  <td className="px-4 py-3">{r.title || "—"}</td>
                  <td className="px-4 py-3">{r.location || "—"}</td>
                  <td className="px-4 py-3">
                    <PipelineStageBadge stage={r.pipeline_stage} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={r.status} />
                      {r.status === "replied" && (
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">Replied</span>
                      )}
                      {r.reply_excerpt && (
                        <p className="text-xs text-muted-foreground mt-1">{r.reply_excerpt}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {attempts}/{maxAttempts}
                    {r.status === "failed" && attempts >= maxAttempts && (
                      <span className="ml-2 text-xs text-red-600">(maxed)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}