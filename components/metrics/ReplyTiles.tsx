"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReplyMetricsResponse = {
  series: any[];
  totals: { sent: number; replies: number; ooo: number; unsub: number };
  kpis: { replyRate: number; oooRate: number; unsubRate: number };
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function ReplyTiles() {
  const { data } = useSWR<ReplyMetricsResponse>(
    "/api/metrics/replies?days=30",
    fetcher,
    { refreshInterval: 30_000 },
  );

  const replyRate = (data?.kpis.replyRate ?? 0) * 100;
  const oooRate = (data?.kpis.oooRate ?? 0) * 100;
  const unsubRate = (data?.kpis.unsubRate ?? 0) * 100;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Reply Rate (30d)</CardTitle>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">{replyRate.toFixed(1)}%</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>OOO Rate</CardTitle>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">{oooRate.toFixed(1)}%</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Unsub Rate</CardTitle>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">{unsubRate.toFixed(1)}%</CardContent>
      </Card>
    </div>
  );
}





