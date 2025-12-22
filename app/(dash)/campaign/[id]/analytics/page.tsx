"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { KPICards } from "./KPICards";
import { SeriesChart } from "./SeriesChart";
import { Button } from "@/components/ui/button";
import { GoalBar } from "./GoalBar";

export default function CampaignAnalyticsPage({ params }: { params: { id: string } }) {
  const [days, setDays] = React.useState(30);
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  async function load(dd = days) {
    setLoading(true);
    const r = await fetch(`/api/campaign/${params.id}/analytics?days=${dd}`);
    const j = await r.json().catch(() => ({}));
    setData(j);
    setLoading(false);
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open(`/api/campaign/${params.id}/analytics/export?days=${days}`, "_blank")
            }
          >
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
          {[7, 14, 30, 60, 90].map((n) => (
            <Button
              key={n}
              size="sm"
              variant={days === n ? "default" : "outline"}
              onClick={() => {
                setDays(n);
                load(n);
              }}
            >
              {n}d
            </Button>
          ))}
        </div>
      </div>

      {!loading && <GoalBar id={params.id} />}

      {loading ? (
        <div className="rounded-xl border p-6 text-sm text-muted-foreground">Loading…</div>
      ) : (data?.series?.length ?? 0) === 0 ? (
        <div className="rounded-xl border p-6 text-sm text-muted-foreground">
          No activity yet. Send a test email and check back — charts update in real time.
        </div>
      ) : (
        <>
          <KPICards data={data} />
          <SeriesChart series={data?.series ?? []} />
        </>
      )}
    </div>
  );
}


