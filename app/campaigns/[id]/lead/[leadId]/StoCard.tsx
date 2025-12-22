"use client";

import { useCallback, useMemo, useState } from "react";

type StoData = {
  best_hour: number | null;
  best_hour_conf: number | null;
  hist_opens: number[] | null;
  hist_clicks: number[] | null;
  updated_at: string | null;
  last_observed_at: string | null;
  tz: string | null;
};

type Props = {
  campaignId: string;
  leadId: string;
  initialSto: StoData | null;
  fallbackTz: string | null;
};

export function StoCard({ campaignId, leadId, initialSto, fallbackTz }: Props) {
  const [sto, setSto] = useState<StoData | null>(initialSto);
  const [loading, setLoading] = useState(false);
  const [tzInput, setTzInput] = useState<string>(sto?.tz ?? fallbackTz ?? "");

  const chartData = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => {
      const opens = sto?.hist_opens?.[i] ?? 0;
      const clicks = sto?.hist_clicks?.[i] ?? 0;
      return { hour: i, opens, clicks, score: opens + 2 * clicks };
    });
  }, [sto]);

  const displayTz = sto?.tz ?? fallbackTz ?? "America/Los_Angeles";
  const bestHourLabel =
    sto?.best_hour != null
      ? `${String(sto.best_hour).padStart(2, "0")}:00`
      : "N/A";
  const confidence =
    sto?.best_hour_conf != null
      ? Math.round((sto.best_hour_conf ?? 0) * 100) / 100
      : 0;

  const refresh = useCallback(async () => {
    const res = await fetch(
      `/api/lead/${leadId}/sto?campaignId=${campaignId}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const json = await res.json();
      setSto(json.item ?? null);
      if (json.item?.tz) setTzInput(json.item.tz);
    }
  }, [campaignId, leadId]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      setLoading(true);
      try {
        await fetch(`/api/lead/${leadId}/sto?campaignId=${campaignId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await refresh();
      } finally {
        setLoading(false);
      }
    },
    [campaignId, leadId, refresh]
  );

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-medium">Best Send Time</div>
          <div className="text-sm text-muted-foreground">
            {sto?.best_hour != null
              ? `${bestHourLabel} • conf ${confidence}`
              : "Not enough data yet"}
          </div>
          <div className="text-xs text-muted-foreground">
            TZ: {displayTz}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-xl border px-3 py-2 text-sm"
            disabled={loading || sto?.best_hour == null}
            onClick={() => post({ useNext: true })}
          >
            Use for next step
          </button>
          <button
            className="rounded-xl border px-3 py-2 text-sm"
            disabled={loading}
            onClick={() => post({ reset: true })}
          >
            Reset
          </button>
        </div>
      </div>

      <div
        className="mt-3 grid gap-1 items-end h-24"
        style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
      >
        {chartData.map(({ hour, opens, clicks, score }) => {
          const height = Math.min(100, Math.max(4, score * 4));
          const isBest = hour === sto?.best_hour;
          return (
            <div
              key={hour}
              title={`${String(hour).padStart(2, "0")}:00 — O:${opens} C:${clicks}`}
              className={`rounded-sm transition-all ${
                isBest ? "bg-blue-500" : "bg-muted"
              }`}
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="rounded-xl border px-3 py-2 text-sm w-48"
          placeholder="America/New_York"
          value={tzInput}
          onChange={(ev) => setTzInput(ev.target.value)}
          disabled={loading}
        />
        <button
          className="rounded-xl border px-3 py-2 text-sm"
          disabled={loading || !tzInput}
          onClick={() => post({ tz: tzInput })}
        >
          Save TZ
        </button>
        <button
          className="rounded-xl border px-3 py-2 text-sm"
          disabled={loading}
          onClick={refresh}
        >
          Refresh
        </button>
      </div>

      {sto?.updated_at && (
        <div className="text-xs text-muted-foreground">
          Updated {new Date(sto.updated_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}

