"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BaselineOk = {
  ok: true;
  homeowners_contacted: { low: number; high: number };
  replies: { low: number; high: number };
  jobs_booked: { low: number; high: number };
  sample_weeks: number;
  window_weeks: number;
};

type BaselineNotOk = {
  ok: false;
  reason: string;
  sample_weeks?: number;
  min_weeks?: number;
  window_weeks?: number;
};

type NormalRangeResponse = {
  ok: true;
  week_start: string;
  week_progress: number;
  current_week: { homeowners_contacted: number; replies: number; jobs_booked: number };
  baseline: BaselineOk | BaselineNotOk;
  drift_message: string | null;
};

function fmtRange(low: number, high: number) {
  const l = Math.max(0, Math.round(low));
  const h = Math.max(0, Math.round(high));
  return `${l.toLocaleString()}–${h.toLocaleString()}`;
}

export default function NormalRangeCard() {
  const [data, setData] = useState<NormalRangeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/reliability/normal-range", { cache: "no-store" as any })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then((json) => {
        if (mounted) setData(json as NormalRangeResponse);
      })
      .catch(() => {
        if (mounted) setData(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const baselineOk = Boolean(data?.baseline && (data.baseline as any).ok);

  const subtitle = useMemo(() => {
    if (!data?.week_start) return "Normal Range";
    return `Week of ${data.week_start}`;
  }, [data?.week_start]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Normal Range</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  if (!data) return null;

  if (!baselineOk) {
    const b = data.baseline as BaselineNotOk;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Normal Range</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="text-muted-foreground">{subtitle}</div>
          <div className="text-muted-foreground">
            Building baseline…{" "}
            {typeof b.sample_weeks === "number" && typeof b.min_weeks === "number"
              ? `(${b.sample_weeks}/${b.min_weeks} weeks)`
              : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  const b = data.baseline as BaselineOk;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Normal Range</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="text-muted-foreground">{subtitle}</div>

        {data.drift_message ? <div className="text-xs text-amber-800">{data.drift_message}</div> : null}

        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Homeowners contacted / week</div>
            <div className="mt-1 font-semibold tabular-nums">{fmtRange(b.homeowners_contacted.low, b.homeowners_contacted.high)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              This week: {data.current_week.homeowners_contacted.toLocaleString()}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Replies / week</div>
            <div className="mt-1 font-semibold tabular-nums">{fmtRange(b.replies.low, b.replies.high)}</div>
            <div className="mt-1 text-xs text-muted-foreground">This week: {data.current_week.replies.toLocaleString()}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Jobs booked / week</div>
            <div className="mt-1 font-semibold tabular-nums">{fmtRange(b.jobs_booked.low, b.jobs_booked.high)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              This week: {data.current_week.jobs_booked.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground">
          Rolling baseline ({b.sample_weeks} weeks).
        </div>
      </CardContent>
    </Card>
  );
}




