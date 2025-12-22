"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Summary = {
  user_id: string;
  warmup_enabled: boolean;
  daily_cap: number;
  ramp_stage: number;
  sent_today: number;
  outbound_7d: number;
  bounces_7d: number;
  bounce_rate_7d: number;
  suggested_cap: number;
  warnings: string[];
  error?: string;
};

export function SendHealthCard({ userId }: { userId: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/safety/summary?user_id=${encodeURIComponent(userId)}`);
      const j = await res.json();
      setData(j);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [userId]);

  if (!userId) return null;

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">Send Safety</div>
          <div className="text-xl font-semibold">Sender Health</div>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {!data ? (
        <div className="mt-4 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Daily Cap" value={data.daily_cap} />
            <Stat label="Sent Today" value={data.sent_today} />
            <Stat label="Bounce Rate (7d)" value={`${data.bounce_rate_7d}%`} />
            <Stat label="Suggested Cap" value={data.suggested_cap} />
          </div>

          {data.warnings?.length ? (
            <div className="mt-4 rounded-lg border border-amber-300/40 bg-amber-100/20 p-3 text-sm">
              <div className="font-medium mb-1">Warnings</div>
              <ul className="list-disc pl-5">
                {data.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-emerald-300/40 bg-emerald-100/20 p-3 text-sm">
              Looks good — safe to ramp if replies quality is steady.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
