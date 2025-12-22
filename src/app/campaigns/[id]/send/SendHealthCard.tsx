"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SendStats = {
  queue?: { queued?: number; working?: number };
  last_hour?: { ok?: number; rate?: number; soft?: number; hard?: number };
  last_24h?: { ok?: number; rate?: number; soft?: number; hard?: number; eoauth?: number };
  budget?: {
    account_id: string;
    hourly_used: number;
    hourly_quota: number;
    daily_used: number;
    daily_quota: number;
  } | null;
};

export function SendHealthCard({ campaignId }: { campaignId: string }) {
  const [data, setData] = React.useState<SendStats | null>(null);

  React.useEffect(() => {
    let alive = true;

    const refresh = async () => {
      try {
        const res = await fetch(`/api/campaign/${campaignId}/send-stats`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (alive) setData(json);
      } catch {
        // swallow errors for polling
      }
    };

    refresh();
    const interval = setInterval(refresh, 10_000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [campaignId]);

  if (!data) return null;

  const Line = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="mb-1 text-xs uppercase text-muted-foreground">Queue</div>
            {Line("Queued", data.queue?.queued ?? 0)}
            {Line("Working", data.queue?.working ?? 0)}
          </div>
          <div className="rounded-lg border p-3">
            <div className="mb-1 text-xs uppercase text-muted-foreground">Last Hour</div>
            {Line("Sent", data.last_hour?.ok ?? 0)}
            {Line("Rate Holds", data.last_hour?.rate ?? 0)}
            {Line("Errors", (data.last_hour?.soft ?? 0) + (data.last_hour?.hard ?? 0))}
          </div>
          <div className="rounded-lg border p-3">
            <div className="mb-1 text-xs uppercase text-muted-foreground">24 Hours</div>
            {Line("Sent", data.last_24h?.ok ?? 0)}
            {Line("Rate Holds", data.last_24h?.rate ?? 0)}
            {Line("OAuth Errors", data.last_24h?.eoauth ?? 0)}
          </div>
        </div>

        {data.budget && (
          <div className="rounded-lg border p-3">
            <div className="mb-1 text-xs uppercase text-muted-foreground">Budget (Account)</div>
            {Line("Hourly", `${data.budget.hourly_used}/${data.budget.hourly_quota}`)}
            {Line("Daily", `${data.budget.daily_used}/${data.budget.daily_quota}`)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


