"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";

type MetricsResponse = {
  dupe?: Array<{ day?: string | null; candidate_count?: number }>;
  merges?: Array<{ merges?: number }>;
};

export function MetricsCard() {
  const [metrics, setMetrics] = React.useState<MetricsResponse>({});

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/dupes/metrics")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setMetrics(data);
        }
      })
      .catch((err) => {
        console.error("Failed to load dupe metrics", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const dupeToday = (metrics.dupe ?? [])
    .filter((item) => item.day?.slice(0, 10) === today)
    .reduce((acc, item) => acc + (item.candidate_count ?? 0), 0);

  const merged7d = (metrics.merges ?? []).reduce(
    (acc, item) => acc + (item.merges ?? 0),
    0
  );

  return (
    <Card className="flex items-center gap-6 p-3 text-sm">
      <div>
        <span className="opacity-60">Candidates today:</span>{" "}
        <span className="font-medium">{dupeToday || 0}</span>
      </div>
      <div>
        <span className="opacity-60">Merges (7d):</span>{" "}
        <span className="font-medium">{merged7d || 0}</span>
      </div>
    </Card>
  );
}


