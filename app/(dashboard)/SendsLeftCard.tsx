"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Progress } from "@/components/ui/progress";

type UsageRow = {
  account_id: string;
  email: string;
  provider: string;
  cap_24h: number;
  cap_1h: number;
  effective_cap_24h: number;
  effective_cap_1h: number;
  left_24h: number;
  left_1h: number;
};

export default function SendsLeftCard() {
  const [rows, setRows] = React.useState<UsageRow[]>([]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await fetch("/api/sends/usage", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (mounted && Array.isArray(payload?.accounts)) {
          setRows(
            payload.accounts.map((row: any) => ({
              account_id: row.account_id,
              email: row.email ?? "",
              provider: row.provider ?? "",
              cap_24h: Number(row.cap_24h ?? 150),
              cap_1h: Number(row.cap_1h ?? 30),
              effective_cap_24h: Number(
                row.effective_cap_24h ?? row.cap_24h ?? 150
              ),
              effective_cap_1h: Number(
                row.effective_cap_1h ?? row.cap_1h ?? 30
              ),
              left_24h: Number(row.left_24h ?? 0),
              left_1h: Number(row.left_1h ?? 0),
            }))
          );
        }
      } catch {
        // ignore fetch errors for now; card will render empty state
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!rows.length) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold">Sends left today</h3>
          <div className="text-sm text-muted-foreground mt-2">
            No connected mail accounts yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6 space-y-4">
        <h3 className="text-lg font-semibold">Sends left today</h3>
        <div className="space-y-3">
          {rows.map((row) => {
            const capDaily = Math.max(1, row.effective_cap_24h);
            const capHourly = Math.max(1, row.effective_cap_1h);
            const used = Math.max(0, capDaily - row.left_24h);
            const pct = Math.min(100, Math.round((used / capDaily) * 100));
            return (
              <div key={row.account_id} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{row.email} · {row.provider}</span>
                  <span>
                    {row.left_24h}/{capDaily} left · {row.left_1h}/{capHourly} this hour
                  </span>
                </div>
                <Progress value={pct} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}


