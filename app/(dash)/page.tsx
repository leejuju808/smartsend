"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type AgeBucket = "new" | "warm" | "stale" | "cold";

type Row = {
  id: string;
  campaign_id: string;
  lead_id: string;
  lead_name: string | null;
  lead_company: string | null;
  lead_email: string | null;
  last_inbound_at: string | null;
  age_mins: number;
  age_bucket: AgeBucket;
  last_inbound_label: string | null;
};

type Counts = {
  user_id: string;
  c_new: number;
  c_warm: number;
  c_stale: number;
  c_cold: number;
  c_total: number;
};

export default function HomeDash() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [counts, setCounts] = React.useState<Counts | null>(null);
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const u = new URL("/api/my/queue", window.location.origin);
      if (q) {
        u.searchParams.set("q", q);
      }
      const j = await fetch(u.toString()).then((r) => r.json());
      setRows(Array.isArray(j.items) ? (j.items as Row[]) : []);
      setCounts(j.counts ?? null);
    } catch (err) {
      console.error(err);
      setRows([]);
      setCounts(null);
      setError("Failed to load queue.");
    } finally {
      setLoading(false);
    }
  }, [q]);

  React.useEffect(() => {
    load();
  }, [load]);

  function badgeColor(bucket: AgeBucket) {
    switch (bucket) {
      case "new":
        return "border-green-500";
      case "warm":
        return "border-blue-500";
      case "stale":
        return "border-amber-500";
      case "cold":
      default:
        return "border-rose-500";
    }
  }

  function formatLastInbound(iso: string | null) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return "—";
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">My Queue</div>
        <div className="text-sm text-muted-foreground">
          {counts
            ? `New ${counts.c_new} • Warm ${counts.c_warm} • Stale ${counts.c_stale} • Cold ${counts.c_cold} • Total ${counts.c_total}`
            : ""}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          className="rounded-md border p-2 text-sm"
          placeholder="Search my threads…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {error && <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm">{error}</div>}

      <div className="divide-y rounded-2xl border">
        <div className="grid grid-cols-12 p-2 text-xs text-muted-foreground">
          <div className="col-span-5">Lead / Thread</div>
          <div className="col-span-3">Last inbound</div>
          <div className="col-span-2">Intent</div>
          <div className="col-span-2">Age</div>
        </div>
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-12 items-center gap-2 p-3">
            <div className="col-span-5">
              <Link href={`/campaign/${r.campaign_id}/inbox/${r.id}`} className="font-medium">
                {r.lead_name || r.lead_email || `Lead ${r.lead_id.slice(0, 8)}…`}
              </Link>
              <div className="text-xs text-muted-foreground">{r.lead_company || r.lead_email || "—"}</div>
            </div>
            <div className="col-span-3 text-sm">{formatLastInbound(r.last_inbound_at)}</div>
            <div className="col-span-2">
              {r.last_inbound_label && (
                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]">
                  {r.last_inbound_label}
                </span>
              )}
            </div>
            <div className="col-span-2">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${badgeColor(r.age_bucket)}`}
              >
                {r.age_bucket.toUpperCase()} • {r.age_mins}m
              </span>
            </div>
          </div>
        ))}
        {!rows.length && !loading && (
          <div className="p-6 text-sm text-muted-foreground">Nothing assigned. Enjoy the clear deck. 🎯</div>
        )}
        {loading && (
          <div className="p-6 text-sm text-muted-foreground">Loading queue…</div>
        )}
      </div>
    </div>
  );
}



