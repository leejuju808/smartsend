"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type StageCount = { id: string; name: string; count: number };

type HandoverSummary = {
  ok: boolean;
  as_of: string;
  workspace_id: string;
  system: {
    outreach: {
      running_daily: boolean;
      active_campaigns: number;
      last_outbound_at: string | null;
    };
    replies: {
      replies_last_7d: number;
      hot_replies_last_7d: number;
      hot_waiting_unreplied: number;
    };
    pipeline: {
      stages: StageCount[];
    };
    predictability: {
      avg_homeowners_per_week: number;
      avg_booked_jobs_per_week: number;
    };
  };
  operator_proof: {
    last_human_input_at: string | null;
    days_running_without_human_input: number;
    jobs_booked_during_that_time: number;
  };
  audit_trail: Array<{
    id: string;
    date: string;
    contact_name: string;
    contact_email: string | null;
    outcome: string;
    conversion_type: string | null;
    pipeline_stage: string | null;
    estimated_revenue: number;
  }>;
};

function money(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? 0));
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function HandoverClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HandoverSummary | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/handover/summary", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as HandoverSummary | null;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.error || "Failed to load");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stages = useMemo(() => data?.system?.pipeline?.stages ?? [], [data]);
  const hotCount = stages.find((s) => s.name === "Hot")?.count ?? 0;
  const bookedCount = stages.find((s) => s.name === "Booked")?.count ?? 0;
  const closedCount = stages.find((s) => s.name === "Closed")?.count ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">How Jobs Enter This Business</h1>
            <p className="text-sm text-muted-foreground">
              Transferability view. No owner names. No personal steps. Just the system.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/founder-exit">
              <Button variant="outline">Founder Exit</Button>
            </Link>
            <Button variant="outline" onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-semibold text-gray-900">The handover loop</div>
          <div className="mt-2 grid gap-2 md:grid-cols-3 text-sm">
            <div className="rounded-md border bg-gray-50 px-3 py-2">1) Outreach runs daily</div>
            <div className="rounded-md border bg-gray-50 px-3 py-2">2) Replies auto-sorted</div>
            <div className="rounded-md border bg-gray-50 px-3 py-2">3) Hot → Booked → Closed</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/dashboard/daily">
              <Button>Open Daily</Button>
            </Link>
            <Link href="/inbox">
              <Button variant="outline">Open Replies</Button>
            </Link>
            <Link href="/dashboard/pipeline">
              <Button variant="outline">Open Jobs</Button>
            </Link>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Outreach runs daily</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">System state</span>
              <span className="font-semibold">{data?.system.outreach.running_daily ? "RUNNING" : "OFF"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Active campaigns</span>
              <span className="font-semibold tabular-nums">{data?.system.outreach.active_campaigns ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last outbound</span>
              <span className="font-semibold">{fmtDate(data?.system.outreach.last_outbound_at ?? null)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Replies auto-sorted</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Replies (7d)</span>
              <span className="font-semibold tabular-nums">{data?.system.replies.replies_last_7d ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Hot replies (7d)</span>
              <span className="font-semibold tabular-nums">{data?.system.replies.hot_replies_last_7d ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Hot waiting (unreplied)</span>
              <span className="font-semibold tabular-nums">{data?.system.replies.hot_waiting_unreplied ?? 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Predictability (history only)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Avg homeowners / week</span>
              <span className="font-semibold tabular-nums">{data?.system.predictability.avg_homeowners_per_week ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Avg booked jobs / week</span>
              <span className="font-semibold tabular-nums">{data?.system.predictability.avg_booked_jobs_per_week ?? 0}</span>
            </div>
            <div className="pt-2 text-xs text-muted-foreground">
              No forecasts. Just the record of how the machine behaves.
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hot → Booked → Closed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-muted-foreground">Hot</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{hotCount}</div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-muted-foreground">Booked</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{bookedCount}</div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-muted-foreground">Closed</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{closedCount}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              This is the only supported flow: no custom stages, no tribal knowledge.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Replaceable operator proof</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Days running without human input</span>
              <span className="font-semibold tabular-nums">{data?.operator_proof.days_running_without_human_input ?? 0}d</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Jobs booked during that time</span>
              <span className="font-semibold tabular-nums">{data?.operator_proof.jobs_booked_during_that_time ?? 0}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              This is the “if someone took over tomorrow” test: the flow stays visible and measurable.
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4 mb-3">
          <div>
            <h2 className="text-xl font-semibold">Clean audit trail (SmartSend-sourced jobs)</h2>
            <div className="text-xs text-muted-foreground">
              Auto-recorded dates, outcomes, and estimated revenue. No notes. No memory.
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Job</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Outcome</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Est. revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.audit_trail ?? []).length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-muted-foreground" colSpan={4}>
                      No SmartSend-sourced job events yet.
                    </td>
                  </tr>
                ) : (
                  (data?.audit_trail ?? []).map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{fmtDate(r.date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{r.contact_name}</div>
                        {r.contact_email ? (
                          <div className="text-xs text-gray-500">{r.contact_email}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {String(r.outcome || "unknown")
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                        {money(r.estimated_revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}





