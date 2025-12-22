"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

type Lead = {
  id: string;
  email: string;
  status: "queued" | "sending" | "sent" | "failed" | "replied" | string;
  attempt_count?: number | null;
  max_attempts?: number | null;
};

export default function RetryLeadsTable({ rows, refresh }: { rows: Lead[]; refresh: () => void }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected[id]);
  const someSelected = allIds.some((id) => selected[id]);
  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([k]) => k), [selected]);

  const eligibleSelected = useMemo(() => {
    const set = new Set(selectedIds);
    return rows
      .filter((r) => set.has(r.id))
      .filter((r) => r.status === "failed")
      .filter((r) => (r.attempt_count ?? 0) < (r.max_attempts ?? 3))
      .map((r) => r.id);
  }, [rows, selectedIds]);

  const toggleAll = (v: boolean) => {
    const next: Record<string, boolean> = {};
    if (v) rows.forEach((r) => (next[r.id] = true));
    setSelected(next);
  };

  const toggleOne = (id: string, v: boolean) => {
    setSelected((prev) => ({ ...prev, [id]: v }));
  };

  const onRetry = async () => {
    if (selectedIds.length === 0) return;

    const res = await fetch("/api/leads/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_ids: selectedIds }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Retry failed", description: json.error || "Unknown error" });
      return;
    }

    const updatedCount = json.updated ?? json.updated_count ?? (json.updated_ids?.length ?? 0);
    const skippedCount = json.skipped ?? json.skipped_count ?? Math.max(0, selectedIds.length - updatedCount);

    toast({
      title: "Retry queued",
      description: `Updated ${updatedCount}. Skipped ${skippedCount}.`,
    });
    setSelected({});
    refresh();
  };

  return (
    <div className="space-y-2">
      {someSelected && (
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-xl border bg-background p-2 shadow-sm">
          <div className="text-sm">{selectedIds.length} selected · Eligible to retry: {eligibleSelected.length}</div>
          <div className="flex items-center gap-2">
            <Button
              onClick={onRetry}
              disabled={eligibleSelected.length === 0}
              title={eligibleSelected.length === 0 ? "No eligible failed leads under attempt cap" : "Re-enqueue failed leads"}
            >
              Retry Failed
            </Button>
            <Button variant="ghost" onClick={() => setSelected({})}>Clear</Button>
          </div>
        </div>
      )}

      <div className="overflow-auto rounded-xl border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-background">
            <tr>
              <th className="border px-2 py-2">
                <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(Boolean(v))} />
              </th>
              <th className="border px-2 py-2 text-left">Email</th>
              <th className="border px-2 py-2 text-left">Status</th>
              <th className="border px-2 py-2 text-right">Attempts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="border px-2 py-2">
                  <Checkbox checked={!!selected[r.id]} onCheckedChange={(v) => toggleOne(r.id, Boolean(v))} />
                </td>
                <td className="border px-2 py-2">{r.email}</td>
                <td className="border px-2 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                      r.status === "failed"
                        ? "bg-red-100"
                        : r.status === "queued"
                        ? "bg-amber-100"
                        : r.status === "replied"
                        ? "bg-green-100"
                        : "bg-slate-100"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="border px-2 py-2 text-right">{(r.attempt_count ?? 0)}/{r.max_attempts ?? 3}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


