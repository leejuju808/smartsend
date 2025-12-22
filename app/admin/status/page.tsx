"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function AdminStatusPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [salesSession, setSalesSession] = useState<{ startedAt: string; endsAt: string } | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/status");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load");
        setData(json);
        setNotes(json?.execution?.log?.notes ?? "");
      } catch (e) {
        setData({ error: (e as Error).message });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  async function refresh() {
    const res = await fetch("/api/admin/status");
    const json = await res.json();
    setData(json);
    setNotes(json?.execution?.log?.notes ?? "");
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      const res = await fetch("/api/admin/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_notes", notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save notes");
      await refresh();
    } finally {
      setSavingNotes(false);
    }
  }

  async function startSalesSession() {
    const res = await fetch("/api/admin/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start_sales_session" }),
    });
    const json = await res.json();
    if (res.ok && json?.session) setSalesSession(json.session);
  }

  async function endSalesSession() {
    await fetch("/api/admin/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end_sales_session" }),
    });
    setSalesSession(null);
  }

  async function applyNoExcuseLock() {
    await fetch("/api/admin/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "apply_no_excuse_lock" }),
    });
  }

  if (loading) return <div className="p-6">Loading…</div>;
  if (!data || data.error) return <div className="p-6">Forbidden / failed: {data?.error || "Unknown"}</div>;

  const pct = data.sendFailureRate == null ? "N/A" : `${(data.sendFailureRate * 100).toFixed(2)}%`;
  const avg = data.avgSendTimeMs == null ? "N/A" : `${Math.round(data.avgSendTimeMs)} ms`;

  const exec = data.execution;
  const today = exec?.today;
  const week = exec?.week;
  const targets = data.launch?.targets;
  const noExcuse = exec?.noExcuse;

  const endsAtMs = salesSession ? Date.parse(salesSession.endsAt) : null;
  const remainingSec = endsAtMs ? Math.max(Math.ceil((endsAtMs - nowMs) / 1000), 0) : 0;
  const remainingMin = Math.floor(remainingSec / 60);
  const remainingS = remainingSec % 60;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Launch Discipline</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            launch_mode: <span className="font-mono">{String(data.launch?.launchMode)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {salesSession ? (
            <Button variant="destructive" onClick={endSalesSession}>
              End Sales Session
            </Button>
          ) : (
            <Button onClick={startSalesSession}>Start Sales Session (60m)</Button>
          )}
        </div>
      </div>

      {exec?.executionMissed ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-red-800 font-semibold">
          🔴 EXECUTION MISSED
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground font-mono">{today?.date}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Emails Sent</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{today?.emailsSent ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Replies</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{today?.repliesReceived ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Demos</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{today?.demosBooked ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Trials</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{today?.trialsStarted ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Paid</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{today?.paidConversions ?? 0}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>This Week</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground font-mono">
            start: {week?.startDate}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Emails Sent</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{week?.emailsSent ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Replies</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{week?.repliesReceived ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Demos</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{week?.demosBooked ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Trials</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{week?.trialsStarted ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Paid</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{week?.paidConversions ?? 0}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>MRR</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">${today?.mrr ?? 0}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Non‑Negotiable Targets (Locked)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <div>25 outbound emails / day</div>
            <div className="font-mono">
              {today?.emailsSent ?? 0}/{targets?.outboundEmailsPerDay ?? 25}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>1 demo / day</div>
            <div className="font-mono">
              {today?.demosBooked ?? 0}/{targets?.demosPerDay ?? 1}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>1 trial / day</div>
            <div className="font-mono">
              {today?.trialsStarted ?? 0}/{targets?.trialsPerDay ?? 1}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>Missed streak (days)</div>
            <div className="font-mono">{exec?.missedStreak ?? 0}/3</div>
          </div>
          {(exec?.missedStreak ?? 0) >= 3 ? (
            <div className="pt-2">
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                No‑Excuse Rules are active. Builder is hidden for 48h.
                <div className="mt-1 text-xs font-mono">
                  builder_lock_until: {noExcuse?.builderLockUntil ?? "—"}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button variant="destructive" onClick={applyNoExcuseLock}>
                  Re‑apply Lock Now
                </Button>
                <div className="text-xs text-muted-foreground">
                  (Only needed if cookies were cleared.)
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Demo mode forced, script pinned, builder hidden for 48h.
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sales Script (Pinned)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="rounded-lg border bg-muted/30 p-3 leading-relaxed">
            “We help roofers send estimates faster, follow up automatically, and prove ROI in one dashboard. If one job closes, it pays for itself.”
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            pinned_until: {noExcuse?.salesScriptPinnedUntil ?? "—"}
          </div>
        </CardContent>
      </Card>

      {salesSession ? (
        <Card>
          <CardHeader>
            <CardTitle>Sales Session Timer</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-3xl font-bold tabular-nums">
              {remainingMin}:{String(remainingS).padStart(2, "0")}
            </div>
            <div className="text-sm text-muted-foreground font-mono">
              endsAt: {new Date(salesSession.endsAt).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Execution Log (Mandatory)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground font-mono">date: {today?.date}</div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional). Outcomes auto-filled where possible."
            rows={4}
          />
          <div className="flex items-center justify-end">
            <Button onClick={saveNotes} disabled={savingNotes}>
              {savingNotes ? "Saving…" : "Save Notes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Launch Checklist (Read‑Only)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ChecklistItem ok={(today?.mrr ?? 0) > 0} label="Payments working" />
          <ChecklistItem ok={(data.sendFailureRate ?? 0) < 0.1 && (today?.emailsSent ?? 0) > 0} label="Emails delivering" />
          <ChecklistItem ok={(data.founderSlotsRemaining ?? 0) > 0} label="Founder offer active" />
          <ChecklistItem ok={(today?.demosBooked ?? 0) > 0 || (week?.demosBooked ?? 0) > 0} label="Demo flow smooth" />
          <ChecklistItem ok={true} label="Case studies generated" />
        </CardContent>
      </Card>

      <h2 className="text-2xl font-bold">System Status</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Active Companies</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{data.activeCompanies}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active Subscriptions</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{data.activeSubscriptions}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Founder Slots Remaining</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{data.founderSlotsRemaining}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Send Failure Rate</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{pct}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Avg Send Time</CardTitle>
        </CardHeader>
        <CardContent className="text-xl font-semibold">{avg}</CardContent>
      </Card>
    </div>
  );
}

function ChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
      <div>{label}</div>
      <div className={`font-mono ${ok ? "text-green-700" : "text-red-700"}`}>{ok ? "GREEN" : "RED"}</div>
    </div>
  );
}










