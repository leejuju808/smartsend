"use client";

import useSWR from "swr";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

export function UpgradeNudge({ userId }: { userId: string }) {
  const { data } = useSWR(
    `/api/billing/summary?user=${userId}`,
    (u) => fetch(u).then(r => r.json()),
    { refreshInterval: 15000 }
  );

  const s = data?.summary;
  if (!s) return null;

  const pct = s.usage_soft_cap ? (s.emails_sent_today / s.usage_soft_cap) : 0;

  if (pct < 0.8) return null;

  const severity = pct >= 1 ? "destructive" : "default";

  async function upgrade() {
    // Send to pricing if at soft cap.
    window.location.href = "/pricing";
  }

  return (
    <div className="mx-auto max-w-5xl p-2">
      <Alert className="flex items-center justify-between" style={severity === "destructive" ? { borderColor: "rgb(220 38 38)", backgroundColor: "rgb(254 242 242)" } : {}}>
        <div>
          <AlertTitle>{pct >= 1 ? "Daily limit reached" : "Approaching daily limit"}</AlertTitle>
          <AlertDescription>
            {s.emails_sent_today} / {s.usage_soft_cap} emails sent today. Upgrade to increase capacity.
          </AlertDescription>
        </div>
        <Button size="sm" onClick={upgrade}>{pct >= 1 ? "See Plans" : "Upgrade"}</Button>
      </Alert>
    </div>
  );
}
