"use client";

import { useEffect, useMemo, useState } from "react";

type WeeklyData = {
  week_start: string;
  week_end_exclusive: string;
  jobs_booked: number;
  jobs_closed: number;
  no_activity: boolean;
  pattern_line: string | null;
};

export default function WeeklyJobCountCard() {
  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/reality-anchor/weekly", { cache: "no-store" as any })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then((json) => {
        if (mounted) setData(json);
      })
      .catch(() => {
        if (mounted) setData(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const weekLabel = useMemo(() => {
    if (!data?.week_start) return "This week";
    return `Week of ${data.week_start}`;
  }, [data?.week_start]);

  if (loading) {
    return (
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </section>
    );
  }

  if (!data) return null;

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Weekly job count</div>
          <div className="mt-1 text-sm text-muted-foreground">{weekLabel}</div>
        </div>
        {data.no_activity ? (
          <div className="text-xs px-2 py-1 rounded-full border bg-amber-50 text-amber-900 border-amber-200">
            Quiet week so far.
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Jobs booked</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">{data.jobs_booked || 0}</div>
        </div>
        <div className="rounded-xl border bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Jobs closed</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">{data.jobs_closed || 0}</div>
        </div>
      </div>

      {data.pattern_line ? (
        <div className="mt-3 text-sm text-muted-foreground">{data.pattern_line}</div>
      ) : null}
    </section>
  );
}







