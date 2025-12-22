"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Report = {
  ok: boolean;
  error?: string;
  session?: { id: string; started_at: string; ended_at: string | null };
  proof?: {
    outreach: Array<{ day: string; sent_count: number; ran: boolean }>;
    replies: { total_inbound: number; held: number; urgent_hot_escalated: number };
    jobs: { conversions_booked: number; conversions_won: number; booked_value: number; handoffs_generated: number };
  };
};

function money(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? 0));
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function OwnerContinuityPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/away/report", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as Report | null;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.error || "Failed to load report");
      setReport(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const days = useMemo(() => report?.proof?.outreach || [], [report]);
  const missedDays = days.filter((d) => !d.ran);
  const replies = report?.proof?.replies;
  const jobs = report?.proof?.jobs;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Continuity proof</h1>
          <p className="text-sm text-muted-foreground">
            “Nothing dropped.” Outreach ran, replies were triaged, jobs kept moving.
          </p>
          <div className="mt-2 text-xs text-muted-foreground">
            Outreach continued during operational disruption.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/owner">
            <Button variant="outline">Back</Button>
          </Link>
          <Button onClick={load} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div> : null}

      {!loading && report?.session ? (
        <div className="text-sm text-muted-foreground">
          Session: {new Date(report.session.started_at).toLocaleString()} →{" "}
          {report.session.ended_at ? new Date(report.session.ended_at).toLocaleString() : "now"}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Outreach ran</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">Days covered</div>
            <div className="text-3xl font-semibold tabular-nums">{days.filter((d) => d.ran).length}/{days.length}</div>
            {missedDays.length > 0 ? (
              <div className="text-sm text-red-700">
                Missing: {missedDays.map((d) => d.day).join(", ")}
              </div>
            ) : (
              <div className="text-sm text-emerald-700">Every day had outbound sends.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Replies handled</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">Inbound replies</div>
            <div className="text-3xl font-semibold tabular-nums">{replies?.total_inbound ?? "—"}</div>
            <div className="text-sm text-muted-foreground">Held (non-urgent)</div>
            <div className="text-2xl font-semibold tabular-nums">{replies?.held ?? "—"}</div>
            <div className="text-sm text-muted-foreground">Urgent hot escalations</div>
            <div className="text-2xl font-semibold tabular-nums">{replies?.urgent_hot_escalated ?? "—"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Jobs still moving</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">Booked conversions</div>
            <div className="text-3xl font-semibold tabular-nums">{jobs?.conversions_booked ?? "—"}</div>
            <div className="text-sm text-muted-foreground">Booked value</div>
            <div className="text-2xl font-semibold tabular-nums">{money(jobs?.booked_value)}</div>
            <div className="text-sm text-muted-foreground">Crew handoffs generated</div>
            <div className="text-2xl font-semibold tabular-nums">{jobs?.handoffs_generated ?? "—"}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily proof</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {days.length === 0 ? (
            <div className="text-sm text-muted-foreground">No days in this session.</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {days.map((d) => (
                <div key={d.day} className="flex items-center justify-between rounded-md border bg-white px-3 py-2">
                  <div className="text-sm font-medium tabular-nums">{d.day}</div>
                  <div className="text-sm tabular-nums">{d.ran ? `${d.sent_count} sent` : "No sends"}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}




