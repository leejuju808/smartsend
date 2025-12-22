"use client";

import * as React from "react";

type Benchmarks = {
  campaigns: number;
  reply_rate_median: number;
  reply_rate_p75: number;
  reply_rate_p90: number;
};

export function BenchmarksBar({ days, initial }: { days: number; initial?: Benchmarks | null }) {
  const [benchmarks, setBenchmarks] = React.useState<Benchmarks | null>(initial ?? null);

  React.useEffect(() => {
    setBenchmarks(initial ?? null);
  }, [initial]);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/analytics/benchmarks?days=${days}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setBenchmarks(json?.benchmarks ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBenchmarks(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (!benchmarks) {
    return null;
  }

  return (
    <div className="rounded-xl border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <span className="text-muted-foreground">Median Reply Rate:</span>{" "}
          <span className="font-medium">{format(benchmarks.reply_rate_median)}%</span>
        </div>
        <div>
          <span className="text-muted-foreground">P75:</span>{" "}
          <span className="font-medium">{format(benchmarks.reply_rate_p75)}%</span>
        </div>
        <div>
          <span className="text-muted-foreground">P90:</span>{" "}
          <span className="font-medium">{format(benchmarks.reply_rate_p90)}%</span>
        </div>
        <div className="ml-auto text-muted-foreground">{benchmarks.campaigns} campaigns considered</div>
      </div>
    </div>
  );
}

function format(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number(value).toFixed(2);
}


