"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CashCertaintySummary = {
  org_id: string;
  money_in_motion: number;
  cash_likely_this_week: number;
  cash_likely_next_week: number;
  stalled_amount: number;
  stalled_count: number;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));

export function CashCertaintyPanel() {
  const [summary, setSummary] = useState<CashCertaintySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/cashflow/certainty");
        const json = await res.json();
        if (json?.ok) setSummary(json.summary);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Certainty</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !summary ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : summary ? (
          <>
            <div className="text-sm">
              <span className="font-semibold">{fmt(summary.money_in_motion)}</span>{" "}
              in completed work moving to cash.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Cash likely this week</div>
                <div className="text-lg font-semibold">{fmt(summary.cash_likely_this_week)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Cash likely next week</div>
                <div className="text-lg font-semibold">{fmt(summary.cash_likely_next_week)}</div>
              </div>
            </div>
            {summary.stalled_count > 0 ? (
              <div className="text-sm font-semibold">Completed work awaiting payment.</div>
            ) : null}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">No data.</div>
        )}
      </CardContent>
    </Card>
  );
}



