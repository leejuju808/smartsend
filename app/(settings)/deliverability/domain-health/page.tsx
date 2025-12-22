"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ApiRow = {
  account_id: string;
  domain: string;
  sends: number;
  bounce_rate: number;
  complaint_rate: number;
  today_sent: number;
  cap: number;
  remaining: number;
  status: "healthy" | "warming" | "blocked";
};

type ApiResponse = {
  ok: boolean;
  rows: ApiRow[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DomainHealthPage() {
  const { data, error, isLoading } = useSWR<ApiResponse>("/api/deliverability/domain-health", fetcher, {
    refreshInterval: 60_000,
  });

  const rows = data?.rows ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Domain Health (7d)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr,1fr,auto] text-sm font-medium text-muted-foreground">
          <div>Domain</div>
          <div>Sends</div>
          <div>Bounce</div>
          <div>Complaint</div>
          <div>Today</div>
          <div>Cap</div>
          <div>Status</div>
        </div>

        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading domain health&hellip;</div>
        )}

        {error && (
          <div className="text-sm text-destructive">Failed to load domain health — {String(error)}</div>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <div className="text-sm text-muted-foreground">No recent recipient domains yet.</div>
        )}

        {rows.map((row) => (
          <div
            key={`${row.account_id}-${row.domain}`}
            className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr,1fr,auto] items-center gap-2 border-b border-border/40 py-2 text-sm last:border-none"
          >
            <div className="font-mono text-xs sm:text-sm">{row.domain}</div>
            <div>{row.sends}</div>
            <div className={row.bounce_rate > 0.05 ? "text-destructive" : ""}>{pct(row.bounce_rate)}</div>
            <div className={row.complaint_rate > 0.005 ? "text-destructive" : ""}>{pct(row.complaint_rate)}</div>
            <div>{row.today_sent}</div>
            <div>
              {row.today_sent} / {row.cap}
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={row.status} />
              <Button size="sm" variant="outline">
                Edit rule
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function pct(value: number) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function StatusBadge({ status }: { status: ApiRow["status"] }) {
  if (status === "blocked") {
    return <Badge variant="destructive">Blocked</Badge>;
  }
  if (status === "warming") {
    return <Badge variant="secondary">Warming</Badge>;
  }
  return <Badge variant="default">Healthy</Badge>;
}

