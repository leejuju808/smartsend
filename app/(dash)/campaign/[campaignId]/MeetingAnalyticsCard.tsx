"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type MeetingKpis = {
  intent_to_proposed_pct?: number | null;
  intent_to_booked_pct?: number | null;
  threads_with_intent?: number | null;
  threads_with_proposals?: number | null;
  threads_booked?: number | null;
  p50_intent_to_book_sec?: number | null;
};

type MeetingRepRow = {
  assigned_to: string | null;
  threads_with_intent: number;
  threads_booked: number;
  intent_to_booked_pct?: number | null;
  p50_intent_to_book_sec?: number | null;
};

type MeetingDailyRow = {
  d_utc: string;
  booked: number;
};

type MeetingAnalyticsResponse = {
  ok: boolean;
  kpis: MeetingKpis | null;
  reps: MeetingRepRow[];
  daily: MeetingDailyRow[];
};

const DAY_OPTIONS = [14, 30, 90] as const;

export function secondsToHMS(sec?: number | null) {
  if (!sec || sec <= 0) return "—";
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (hours) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export default function MeetingAnalyticsCard({ campaignId }: { campaignId: string }) {
  const [days, setDays] = React.useState<number>(30);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [payload, setPayload] = React.useState<MeetingAnalyticsResponse | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/campaign/${campaignId}/meeting/analytics?days=${days}`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }
        const json: MeetingAnalyticsResponse = await res.json();
        if (cancelled) return;
        setPayload(json);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Request failed");
        setPayload(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [campaignId, days]);

  const kpis = payload?.kpis ?? null;
  const reps = payload?.reps ?? [];
  const daily = (payload?.daily ?? []).map((row) => ({
    date: row.d_utc,
    booked: row.booked,
  }));

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Meetings</div>
        <div className="flex gap-2">
          {DAY_OPTIONS.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={days === value ? "default" : "outline"}
              onClick={() => setDays(value)}
              disabled={loading && days === value}
            >
              {value}d
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load meeting analytics: {error}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Intent → Proposed</div>
              <div className="text-2xl font-semibold">
                {kpis?.intent_to_proposed_pct ?? "—"}
                {kpis?.intent_to_proposed_pct != null ? "%" : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {(kpis?.threads_with_proposals ?? 0)}/{kpis?.threads_with_intent ?? 0} threads
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Intent → Booked</div>
              <div className="text-2xl font-semibold">
                {kpis?.intent_to_booked_pct ?? "—"}
                {kpis?.intent_to_booked_pct != null ? "%" : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {(kpis?.threads_booked ?? 0)}/{kpis?.threads_with_intent ?? 0} threads
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Median time to book</div>
              <div className="text-2xl font-semibold">{secondsToHMS(kpis?.p50_intent_to_book_sec)}</div>
              <div className="text-xs text-muted-foreground">Intent → Booked</div>
            </div>
          </div>

          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="booked" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {reps.length > 0 && (
            <div className="rounded-md border p-3">
              <div className="mb-2 font-medium">By rep</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {reps.map((rep) => (
                  <div key={rep.assigned_to ?? "unassigned"} className="rounded-md border p-2">
                    <div className="text-sm">
                      {rep.assigned_to ? `Rep: ${rep.assigned_to}` : "Unassigned"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Booked {rep.threads_booked}/{rep.threads_with_intent} · Median {secondsToHMS(rep.p50_intent_to_book_sec)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}



