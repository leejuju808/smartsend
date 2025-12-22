"use client";

import useSWR from "swr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type MetricsRow = {
  variant_id: string;
  label: string;
  sent: number;
  replied: number;
  rate: number;
  prob_best: number;
  is_winner: boolean;
};

export function StatsCard({ experimentId }: { experimentId: string }) {
  const { data } = useSWR<{ ok: boolean; rows: MetricsRow[] }>(
    `/api/experiments/${experimentId}/metrics`,
    (url: string) => fetch(url).then((res) => res.json()),
    { refreshInterval: 8000 }
  );

  const rows = data?.rows ?? [];

  if (!rows.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>A/B Performance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No variant activity yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>A/B Performance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.variant_id} className="rounded-lg border p-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={row.is_winner ? "default" : "secondary"}>
                  {row.label}
                </Badge>
                <span>sent {row.sent}</span>
                <span>replied {row.replied}</span>
                <span>rate {(row.rate * 100).toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-70">
                  prob best {(row.prob_best * 100).toFixed(0)}%
                </span>
                <div className="w-24">
                  <Progress value={row.prob_best * 100} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

