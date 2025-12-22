"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Scorecard = {
  ok: boolean;
  as_of: string;
  workspace_id: string;
  system: {
    autopilot: {
      enabled: boolean;
      enabled_at: string | null;
      locked: boolean;
      locked_at: string | null;
      lock_days: number;
    };
    institutional_policy_locked: boolean;
    institutional_policy_locked_at: string | null;
    outreach_state: string | null;
    campaigns: { active_count: number; paused_count: number };
    last_outbound_at: string | null;
  };
  today: {
    queue: {
      total: number;
      hot_replies: number;
      stalled_estimates: number;
      followups_due: number;
      value_at_risk: number;
    };
  };
  story: {
    window_start: string;
    months: Array<{
      month: string;
      emails_sent: number;
      replies_received: number;
      booked_jobs: number;
      completed_revenue: number;
    }>;
    narrative_markdown: string;
  };
  trust: {
    ok: boolean;
    next_actions: Array<{ label: string; reason: string; url: string }>;
  };
  warnings?: {
    daily_queue_error: string | null;
  };
};

type HandoverSummary = {
  ok: boolean;
  operator_proof?: {
    last_human_input_at: string | null;
    days_running_without_human_input: number;
    jobs_booked_during_that_time: number;
  };
};

function money(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? 0));
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function FounderExitClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Scorecard | null>(null);
  const [handover, setHandover] = useState<HandoverSummary | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [scoreRes, handoverRes] = await Promise.all([
        fetch("/api/founder-exit/scorecard", { cache: "no-store" }),
        fetch("/api/handover/summary", { cache: "no-store" }),
      ]);

      const scoreJson = (await scoreRes.json().catch(() => null)) as Scorecard | null;
      if (!scoreRes.ok || !scoreJson?.ok) throw new Error((scoreJson as any)?.error || "Failed to load founder exit scorecard");

      const handoverJson = (await handoverRes.json().catch(() => null)) as HandoverSummary | null;
      setHandover(handoverRes.ok ? handoverJson : null);

      setData(scoreJson);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
      setHandover(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const storyTail = useMemo(() => {
    const months = data?.story?.months || [];
    return months.slice().reverse().slice(0, 6).reverse();
  }, [data]);

  const trust = data?.trust;
  const queue = data?.today?.queue;
  const system = data?.system;
  const operatorProof = handover?.operator_proof;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Founder Exit</h1>
            <p className="text-sm text-muted-foreground">
              Independent. Transferable. Trustworthy. Permanent.
            </p>
            <div className="mt-2 text-xs text-muted-foreground">
              This page is the “replace the founder” test: what’s happening, what to do next, and the revenue story—without explanation.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/daily">
              <Button variant="outline">Back to Daily</Button>
            </Link>
            <Button onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div> : null}
      </header>

      {data ? (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <Card className={trust?.ok ? "border-emerald-200" : "border-amber-200"}>
              <CardHeader>
                <CardTitle>Silent trust</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className={trust?.ok ? "text-emerald-700 font-semibold" : "text-amber-800 font-semibold"}>
                  {trust?.ok ? "Working. No action required." : "Needs attention."}
                </div>
                <div className="text-xs text-muted-foreground">As of {new Date(data.as_of).toLocaleString()}</div>
                {(trust?.next_actions || []).length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {(trust?.next_actions || []).map((a) => (
                      <div key={a.label} className="rounded-md border bg-white p-3">
                        <div className="text-sm font-semibold">{a.label}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{a.reason}</div>
                        <div className="mt-2">
                          <Link href={a.url}>
                            <Button size="sm">Open</Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Today’s priorities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Hot replies waiting</span>
                  <span className="font-semibold tabular-nums">{queue?.hot_replies ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Stalled estimates</span>
                  <span className="font-semibold tabular-nums">{queue?.stalled_estimates ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Value at risk (est.)</span>
                  <span className="font-semibold tabular-nums">{money(queue?.value_at_risk ?? 0)}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link href="/dashboard/daily">
                    <Button>Open Daily</Button>
                  </Link>
                  <Link href="/dashboard/owner">
                    <Button variant="outline">Owner Control</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Replaceable operator proof</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Days without human input</span>
                  <span className="font-semibold tabular-nums">{operatorProof?.days_running_without_human_input ?? "—"}d</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Jobs booked during that time</span>
                  <span className="font-semibold tabular-nums">{operatorProof?.jobs_booked_during_that_time ?? "—"}</span>
                </div>
                <div className="text-xs text-muted-foreground">Last human input: {fmtDate(operatorProof?.last_human_input_at ?? null)}</div>
                <div className="mt-3">
                  <Link href="/dashboard/handover">
                    <Button variant="outline" size="sm">
                      Open Handover view
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Zero-founder dependency (locks)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Institutional policy locked</span>
                  <span className={system?.institutional_policy_locked ? "font-semibold text-emerald-700" : "font-semibold text-amber-800"}>
                    {system?.institutional_policy_locked ? "YES" : "NO"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">AUTOPILOT (workspace)</span>
                  <span className={system?.autopilot?.enabled ? "font-semibold text-emerald-700" : "font-semibold text-slate-700"}>
                    {system?.autopilot?.enabled ? `ON${system.autopilot.locked ? " (LOCKED)" : ""}` : "OFF"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Active campaigns</span>
                  <span className="font-semibold tabular-nums">{system?.campaigns?.active_count ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Paused campaigns</span>
                  <span className={system?.campaigns?.paused_count ? "font-semibold text-amber-800 tabular-nums" : "font-semibold tabular-nums"}>
                    {system?.campaigns?.paused_count ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last outbound proof</span>
                  <span className="font-semibold">{fmtDate(system?.last_outbound_at ?? null)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/dashboard/campaigns">
                    <Button variant="outline" size="sm">
                      Campaigns
                    </Button>
                  </Link>
                  <Link href="/dashboard/owner/continuity">
                    <Button variant="outline" size="sm">
                      Continuity proof
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>Transfer-ready revenue story</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(data.story.narrative_markdown || "");
                      } catch {}
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadText(`smartsend-revenue-story-${data.workspace_id}.md`, data.story.narrative_markdown || "")}
                  >
                    Download
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">Last 6 months (history only)</div>
                <div className="rounded-md border bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Month</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Sends</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Replies</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Booked</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Completed rev</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {storyTail.map((m) => (
                          <tr key={m.month}>
                            <td className="px-3 py-2">{m.month}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{m.emails_sent.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{m.replies_received.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{m.booked_jobs.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(Math.round(m.completed_revenue))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">Narrative (copy/paste for buyers, partners, banks)</div>
                <pre className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm text-gray-900">
                  {data.story.narrative_markdown || "—"}
                </pre>
              </CardContent>
            </Card>
          </section>

          {data.warnings?.daily_queue_error ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {data.warnings.daily_queue_error}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}



