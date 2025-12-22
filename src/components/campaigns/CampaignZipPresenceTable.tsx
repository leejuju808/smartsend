"use client";

import { useEffect, useMemo, useState } from "react";

type ZipPresenceRow = {
  zip: string;
  homeowners_contacted: number;
  replies: number;
  jobs_booked: number;
  is_active: boolean;
  paused_at: string | null;
};

export function CampaignZipPresenceTable({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<ZipPresenceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingZip, setSavingZip] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/zip-presence`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load zip presence");
      }
      setRows((json.rows || []) as ZipPresenceRow[]);
    } catch (e: any) {
      setError(e?.message || "Failed to load zip presence");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const totals = useMemo(() => {
    const r = rows || [];
    return {
      homeowners_contacted: r.reduce((s, x) => s + (x.homeowners_contacted || 0), 0),
      replies: r.reduce((s, x) => s + (x.replies || 0), 0),
      jobs_booked: r.reduce((s, x) => s + (x.jobs_booked || 0), 0),
    };
  }, [rows]);

  async function toggle(zip: string, nextActive: boolean) {
    setSavingZip(zip);
    setError(null);

    // Optimistic update
    setRows((prev) =>
      (prev || []).map((r) =>
        r.zip === zip
          ? {
              ...r,
              is_active: nextActive,
              paused_at: nextActive ? null : new Date().toISOString(),
            }
          : r
      )
    );

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/zip-presence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip, active: nextActive }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to update zip");
      }

      // Re-load so counts reflect any skipped pending jobs immediately.
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to update zip");
      await load();
    } finally {
      setSavingZip(null);
    }
  }

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Zip Code Presence</div>
          <div className="text-xs text-muted-foreground">
            We’ve been working with homeowners in your area. Here’s where attention is stacking (last 30 days).
          </div>
        </div>

        <button
          onClick={() => void load()}
          className="text-xs underline underline-offset-2"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      {loading && <div className="text-sm opacity-70">Loading…</div>}

      {!loading && (rows?.length || 0) === 0 && (
        <div className="text-sm opacity-70">No ZIP activity yet.</div>
      )}

      {!loading && rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2 pr-3 font-medium">Zip code</th>
                <th className="text-right py-2 px-3 font-medium">Homeowners contacted</th>
                <th className="text-right py-2 px-3 font-medium">Replies</th>
                <th className="text-right py-2 px-3 font-medium">Jobs booked</th>
                <th className="text-right py-2 pl-3 font-medium">Control</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isSaving = savingZip === r.zip;
                return (
                  <tr key={r.zip} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium">{r.zip}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{r.homeowners_contacted}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{r.replies}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{r.jobs_booked}</td>
                    <td className="py-2 pl-3 text-right">
                      <button
                        disabled={isSaving}
                        onClick={() => void toggle(r.zip, !r.is_active)}
                        className={
                          "text-xs px-2 py-1 rounded border " +
                          (r.is_active
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-amber-50 text-amber-700 border-amber-200")
                        }
                        title={
                          r.is_active
                            ? "Active: SmartSend will keep touching this ZIP"
                            : "Paused: SmartSend will stop new sends in this ZIP"
                        }
                      >
                        {isSaving ? "Saving…" : r.is_active ? "Active" : "Paused"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              <tr className="border-t">
                <td className="py-2 pr-3 text-xs text-muted-foreground">Total</td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">{totals.homeowners_contacted}</td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">{totals.replies}</td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">{totals.jobs_booked}</td>
                <td className="py-2 pl-3" />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[11px] text-muted-foreground">
        Tip: Pause a hot ZIP when capacity is full. Activate it again when you’re ready.
      </div>
    </div>
  );
}




