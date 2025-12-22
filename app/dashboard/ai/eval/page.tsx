"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label as UILabel } from "@/components/ui/label";

function HeatCell({ value, max }: { value: number; max: number }) {
  const intensity = max ? Math.round((value / max) * 100) : 0;
  const opacity = 0.15 + 0.7 * (intensity / 100);

  return (
    <td
      className="rounded px-2 py-1 text-center"
      style={{ background: `rgba(250, 204, 21, ${Math.min(opacity, 0.85)})` }}
    >
      {value}
    </td>
  );
}

function AutomationStatus() {
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const [activeRes, metricsRes] = await Promise.all([
          fetch("/api/ai/models/active"),
          fetch("/api/ai/online/metrics"),
        ]);
        const active = activeRes.ok ? await activeRes.json() : null;
        const metrics = metricsRes.ok ? await metricsRes.json() : null;
        setState({
          active,
          hasMetrics: Array.isArray(metrics) && metrics.length > 0,
        });
      } catch {
        setState({ active: null, hasMetrics: false });
      }
    })();
  }, []);

  if (!state) return null;

  return (
    <div className="rounded-xl border p-3 flex flex-wrap items-center gap-4">
      <div className="text-sm">
        Active: <span className="font-medium">{state.active?.active_model || "—"}</span>
      </div>
      <div className="text-sm">
        Canary: <span className="font-medium">{state.active?.canary_model || "—"}</span>
      </div>
      <div className="text-sm">
        Canary %: <span className="font-medium">{state.active?.canary_percent ?? 0}%</span>
      </div>
      <div className="ml-auto text-xs text-muted-foreground">
        Nightly auto-retrain: 3:00 AM • Auto-promote: hourly if canary passes
      </div>
    </div>
  );
}

function PiiPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [autoFix, setAutoFix] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/pii/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: autoFix ? "fix" : "dry", limit: 200 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Scan failed");
        setRows([]);
      } else {
        setRows(data.results || []);
      }
    } catch (err) {
      setError(String(err));
      setRows([]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>PII Hygiene</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="pii-autofix" checked={autoFix} onCheckedChange={setAutoFix} />
            <label htmlFor="pii-autofix" className="text-sm text-muted-foreground">
              Auto-fix on scan
            </label>
          </div>
          <Button onClick={run} disabled={running}>
            {running ? "Scanning..." : "Run Scan"}
          </Button>
          <div className="text-sm text-muted-foreground">
            Scans recent samples; live/logs are auto-guarded by triggers.
          </div>
        </div>
        {error && <div className="text-sm text-red-500">{error}</div>}
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sample</TableHead>
                <TableHead>Changed?</TableHead>
                <TableHead>Before</TableHead>
                <TableHead>After</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.id}</TableCell>
                  <TableCell>{r.changed ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-xs whitespace-pre-wrap">{r.preview_before}</TableCell>
                  <TableCell className="text-xs whitespace-pre-wrap">{r.preview_after}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No issues found (or not scanned yet).
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function LabelingCounters({ refreshKey = 0 }: { refreshKey?: number }) {
  const [stats, setStats] = useState<{ open?: number }>({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [queueRes, metricsRes] = await Promise.all([
          fetch("/api/ai/review/queue"),
          fetch("/api/ai/online/metrics"),
        ]);
        const queue = queueRes.ok ? await queueRes.json() : [];
        if (metricsRes.ok) {
          await metricsRes.json();
        }
        if (!cancelled) {
          setStats({
            open: Array.isArray(queue) ? queue.length : 0,
          });
        }
      } catch {
        if (!cancelled) {
          setStats({ open: 0 });
        }
      }
    };

    load();
    const interval = window.setInterval(load, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshKey]);

  return <div className="text-xs text-muted-foreground">Open review items: {stats.open ?? 0}</div>;
}

function LiveTelemetry() {
  const [series, setSeries] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ai/online/metrics");
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        setSeries(
          Array.isArray(data)
            ? data.map((x: any) => ({
                ...x,
                ts: new Date(x.ts_hour).toLocaleTimeString(),
              }))
            : [],
        );
      } catch {
        // ignore
      }
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Accuracy (last 48h)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={series}>
            <XAxis dataKey="ts" hide />
            <YAxis domain={[0, 1]} />
            <Tooltip />
            <Line type="monotone" dataKey="accuracy_observed" dot={false} stroke="#facc15" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function PromotionPanel({ latestCandidate }: { latestCandidate?: string }) {
  const [state, setState] = useState<any>(null);
  const [candidate, setCandidate] = useState(latestCandidate || "");
  const [percent, setPercent] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/models/active");
      if (!res.ok) {
        setState(null);
        setPercent(0);
        return;
      }
      const data = await res.json();
      setState(data);
      const resolved = Number(data?.canary_percent ?? 0);
      setPercent(Number.isFinite(resolved) ? resolved : 0);
    } catch {
      setState(null);
      setPercent(0);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (latestCandidate) {
      setCandidate(latestCandidate);
    }
  }, [latestCandidate]);

  const checkAndPromote = useCallback(async () => {
    if (!candidate) {
      alert("Enter a candidate version");
      return;
    }
    try {
      const res = await fetch("/api/ai/models/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_version: candidate }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Gate check failed: ${JSON.stringify(data.check?.reasons ?? data)}`);
      }
    } catch (err) {
      alert(`Promotion failed: ${String(err)}`);
    } finally {
      await load();
    }
  }, [candidate, load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Promotion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <div className="text-sm text-muted-foreground">Active Model</div>
            <div className="text-lg font-medium">{state?.active_model || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Canary Model</div>
            <div className="text-lg font-medium">{state?.canary_model || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Canary %</div>
            <div className="text-lg font-medium">{state?.canary_percent ?? 0}%</div>
          </div>
        </div>

        <div className="pt-2">
          <label className="text-sm text-muted-foreground">Candidate Version</label>
          <div className="flex gap-3">
            <Input value={candidate} onChange={(e) => setCandidate(e.target.value)} placeholder="replyclf_v0.6.5" />
            <Button onClick={checkAndPromote}>Promote (Gate-Checked)</Button>
          </div>
        </div>

        <div className="pt-2">
          <label className="text-sm text-muted-foreground">Set Canary %</label>
          <div className="flex items-center gap-4">
            <div className="w-full max-w-md">
              <Slider
                min={0}
                max={100}
                step={5}
                value={[percent]}
                onValueChange={(v) => {
                  const next = Math.max(0, Math.min(100, Number(v[0] ?? 0)));
                  setPercent(next);
                }}
              />
            </div>
            <div className="w-12 text-right">{percent}%</div>
            <Button
              variant="secondary"
              onClick={async () => {
                const res = await fetch("/api/ai/models/set-canary", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ canary_version: candidate, percent }),
                });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  alert(`Set canary failed: ${JSON.stringify(data)}`);
                }
                await load();
              }}
            >
              Apply
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const res = await fetch("/api/ai/models/rollback", { method: "POST" });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  alert(`Rollback failed: ${JSON.stringify(data)}`);
                }
                await load();
              }}
            >
              Rollback
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EvalSetManager({ defaultModel }: { defaultModel?: string }) {
  const [sets, setSets] = useState<any[]>([]);
  const [leaks, setLeaks] = useState<Record<string, number>>({});
  const [name, setName] = useState("golden_v1");
  const [model, setModel] = useState(defaultModel || "");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/evalset/list");
      if (!res.ok) return;
      const data = await res.json();
      setSets(Array.isArray(data?.sets) ? data.sets : []);
      setLeaks(typeof data?.leaks === "object" && data?.leaks !== null ? data.leaks : {});
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (defaultModel) {
      setModel(defaultModel);
    }
  }, [defaultModel]);

  const ensure = async () => {
    if (!name) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/evalset/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, notes: null }),
      });
      const data = await res.json();
      if (res.ok) {
        setSelected(data.id);
        await load();
      } else {
        alert(`Failed to create set: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      alert(String(err));
    } finally {
      setLoading(false);
    }
  };

  const addRecent = async (label?: string) => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/evalset/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eval_set_id: selected, label, limit: 300 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Add failed: ${JSON.stringify(data)}`);
      }
      await load();
    } finally {
      setLoading(false);
    }
  };

  const freeze = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/evalset/freeze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eval_set_id: selected }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Freeze failed: ${JSON.stringify(data)}`);
      }
      await load();
    } finally {
      setLoading(false);
    }
  };

  const run = async () => {
    if (!selected || !model) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/evalset/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eval_set_id: selected, model_version: model }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Eval failed: ${JSON.stringify(data)}`);
      } else {
        alert("Eval started (check metrics cards).");
      }
    } catch (err) {
      alert(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Eval Set Manager</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Set name (e.g., golden_v1)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-xs"
          />
          <Button onClick={ensure} disabled={loading}>
            Create / Select
          </Button>
          <Input
            placeholder="Model version"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="max-w-xs"
          />
          <Button variant="secondary" onClick={run} disabled={!selected || !model || loading}>
            Run Eval on Set
          </Button>
          <Button variant="outline" onClick={freeze} disabled={!selected || loading}>
            Freeze Set
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Quick add recent samples:</span>
          <Button size="sm" onClick={() => addRecent()} disabled={!selected || loading}>
            All labels
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => addRecent("meeting_intent")}
            disabled={!selected || loading}
          >
            meeting_intent
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => addRecent("unsubscribe")}
            disabled={!selected || loading}
          >
            unsubscribe
          </Button>
          <Button size="sm" variant="secondary" onClick={() => addRecent("ooo")} disabled={!selected || loading}>
            ooo
          </Button>
        </div>

        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Set</TableHead>
                <TableHead>Frozen</TableHead>
                <TableHead>Leakage</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sets.map((s: any) => (
                <TableRow
                  key={s.id}
                  className={`${selected === s.id ? "bg-muted/30" : ""} cursor-pointer`}
                  onClick={() => setSelected(s.id)}
                >
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.is_frozen ? <Badge>frozen</Badge> : <Badge variant="secondary">open</Badge>}</TableCell>
                  <TableCell>
                    {leaks[s.id] ? <span className="text-red-600">{leaks[s.id]} leaks</span> : "0"}
                  </TableCell>
                  <TableCell>{s.created_at ? new Date(s.created_at).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.notes || "—"}</TableCell>
                </TableRow>
              ))}
              {!sets.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    No eval sets yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-xs text-muted-foreground">
          Tip: Freeze a set before promotion; freeze also forces its members to <code>holdout</code> to avoid leakage.
        </div>
      </CardContent>
    </Card>
  );
}

const CLASS_LABELS = [
  { k: "1", v: "meeting_intent" },
  { k: "2", v: "generic_positive" },
  { k: "3", v: "question" },
  { k: "4", v: "ooo" },
  { k: "5", v: "unsubscribe" },
  { k: "6", v: "not_interested" },
  { k: "7", v: "bounce" },
];

function QueueItem({ q, onDone }: { q: any; onDone: () => void }) {
  const [lock, setLock] = useState(false);
  const [notes, setNotes] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const label = useCallback(
    async (labelValue: string) => {
      const res = await fetch("/api/ai/review/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          live_inference_id: q.live_inference_id,
          label: labelValue,
          notes,
          lock,
        }),
      });
      if (res.ok) {
        await onDone();
      }
    },
    [lock, notes, onDone, q.live_inference_id],
  );

  const dismiss = useCallback(async () => {
    const res = await fetch("/api/ai/review/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ live_inference_id: q.live_inference_id }),
    });
    if (res.ok) {
      await onDone();
    }
  }, [onDone, q.live_inference_id]);

  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (!containerRef.current?.matches(":hover")) return;

      const hit = CLASS_LABELS.find((c) => c.k === e.key);
      if (hit) {
        await label(hit.v);
        e.preventDefault();
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "d") {
        await dismiss();
        e.preventDefault();
        return;
      }

      if (key === "g") {
        setLock((v) => !v);
        e.preventDefault();
        return;
      }

      if (e.key === "Enter") {
        await label("meeting_intent");
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dismiss, label]);

  return (
    <div ref={containerRef} className="rounded-xl border p-3 transition hover:shadow-sm">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{q.reason}</Badge>
        <span className="text-xs text-muted-foreground">
          {q.created_at ? new Date(q.created_at).toLocaleString() : "—"}
        </span>
      </div>

      <div className="mt-2 text-sm">{q.ai_live_inferences?.text_preview || "—"}</div>

      <div className="mt-1 text-xs text-muted-foreground">
        Pred: {q.ai_live_inferences?.predicted_label ?? "—"} · score{" "}
        {typeof q.ai_live_inferences?.score === "number" ? q.ai_live_inferences.score.toFixed(3) : "—"} vs thr{" "}
        {typeof q.ai_live_inferences?.threshold === "number" ? q.ai_live_inferences.threshold.toFixed(3) : "—"}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {CLASS_LABELS.map((c) => (
          <Button key={c.v} size="sm" variant="secondary" onClick={() => label(c.v)}>
            {c.k}. {c.v}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={dismiss} title="Dismiss (D)">
          Dismiss
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Switch id={`lock-${q.id}`} checked={lock} onCheckedChange={setLock} />
        <UILabel htmlFor={`lock-${q.id}`} className="text-sm">
          Golden (lock sample) [G]
        </UILabel>
      </div>

      <div className="mt-2">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        Hotkeys: <kbd>1</kbd>–<kbd>7</kbd> label · <kbd>G</kbd> golden · <kbd>D</kbd> dismiss · <kbd>Enter</kbd>{" "}
        meeting_intent
      </div>
    </div>
  );
}

function LabelSprint({ onBatchLoaded }: { onBatchLoaded?: (ids: string[]) => void }) {
  const [strategy, setStrategy] = useState("quota_mix");
  const [batchSize, setBatchSize] = useState(10);
  const [fetching, setFetching] = useState(false);
  const [running, setRunning] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completed, setCompleted] = useState(0);

  const doneCount = useCallback(async () => {
    if (!ids.length) {
      return 0;
    }

    try {
      const res = await fetch("/api/ai/review/queue");
      if (!res.ok) {
        return 0;
      }
      const queue = await res.json();
      const openIds = new Set((Array.isArray(queue) ? queue : []).map((q: any) => q.live_inference_id));
      return ids.filter((id) => !openIds.has(id)).length;
    } catch {
      return 0;
    }
  }, [ids]);

  const start = useCallback(async () => {
    if (fetching) {
      return;
    }

    setFetching(true);
    try {
      const res = await fetch("/api/ai/al/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_size: batchSize, strategy }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Failed to load batch", data);
        setIds([]);
        setRunning(false);
        setStartedAt(null);
        setCompleted(0);
        return;
      }

      const items = await res.json();
      const nextIds = Array.isArray(items) ? items.map((x: any) => x.id).filter(Boolean) : [];
      setIds(nextIds);
      setStartedAt(nextIds.length ? Date.now() : null);
      setElapsedMs(0);
      setCompleted(0);
      setRunning(nextIds.length > 0);
      onBatchLoaded?.(nextIds);
    } finally {
      setFetching(false);
    }
  }, [batchSize, fetching, onBatchLoaded, strategy]);

  useEffect(() => {
    if (!running || !startedAt) {
      return;
    }

    setElapsedMs(Date.now() - startedAt);
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => clearInterval(timer);
  }, [running, startedAt]);

  useEffect(() => {
    let cancelled = false;
    if (!running || !ids.length) {
      return;
    }

    const poll = async () => {
      const finished = await doneCount();
      if (cancelled) {
        return;
      }
      setCompleted(finished);
      if (finished >= ids.length) {
        setRunning(false);
        setStartedAt(null);
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [doneCount, ids.length, running]);

  const reset = useCallback(() => {
    setRunning(false);
    setIds([]);
    setStartedAt(null);
    setElapsedMs(0);
    setCompleted(0);
  }, []);

  const seconds = Math.floor(elapsedMs / 1000);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start 10-Label Sprint</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Select value={strategy} onValueChange={setStrategy}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Strategy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="quota_mix">Quota mix (auto)</SelectItem>
            <SelectItem value="uncertain">Uncertain</SelectItem>
            <SelectItem value="disagree">Disagreement</SelectItem>
          </SelectContent>
        </Select>

        <Select value={String(batchSize)} onValueChange={(v) => setBatchSize(Number(v))}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Batch size" />
          </SelectTrigger>
          <SelectContent>
            {[5, 10, 15, 20].map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} items
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={start} disabled={fetching}>
          {fetching ? "Loading..." : "Get Batch"}
        </Button>

        {ids.length > 0 && (
          <>
            <Badge variant="outline">
              {completed}/{ids.length} done
            </Badge>
            <Badge>{ids.length} items</Badge>
            <span className="text-sm text-muted-foreground">Timer: {seconds}s</span>
            <Button size="sm" variant="ghost" onClick={reset}>
              Reset
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewQueue({ reloadKey = 0 }: { reloadKey?: number }) {
  const [items, setItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/review/queue");
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Queue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((q: any) => (
          <QueueItem key={q.id} q={q} onDone={load} />
        ))}
        {!items.length && <div className="text-sm text-muted-foreground">No items to review.</div>}
      </CardContent>
    </Card>
  );
}

export default function AIEvalDashboard() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confusion, setConfusion] = useState<any[]>([]);
  const [perLabel, setPerLabel] = useState<any[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number>(0.65);
  const [queueReloadKey, setQueueReloadKey] = useState(0);
  const targetLabel = "meeting_intent";

  useEffect(() => {
    const fetchMetrics = async () => {
      const res = await fetch("/api/ai/eval/metrics");
      const data = await res.json();
      setMetrics(data);
      setLoading(false);
    };

    fetchMetrics();
  }, []);

  useEffect(() => {
    const mv = metrics?.[0]?.model_version;
    if (mv) {
      setModel(mv);
    }
  }, [metrics]);

  useEffect(() => {
    if (!model) {
      return;
    }

    const load = async () => {
      const search = encodeURIComponent(model);
      const [c, p, t] = await Promise.all([
        fetch(`/api/ai/eval/confusion?model_version=${search}`).then((r) => r.json()),
        fetch(`/api/ai/eval/per-label?model_version=${search}`).then((r) => r.json()),
        fetch(`/api/ai/eval/threshold?model_version=${search}&label=${encodeURIComponent(targetLabel)}`).then((r) =>
          r.json(),
        ),
      ]);

      setConfusion(Array.isArray(c) ? c : []);
      setPerLabel(Array.isArray(p) ? p : []);
      if (Array.isArray(t) && t[0]?.threshold !== undefined && t[0]?.threshold !== null) {
        setThreshold(Number(t[0].threshold));
      }
    };

    load();
  }, [model, targetLabel]);

  const handleBatchLoaded = useCallback((ids: string[]) => {
    if (ids.length) {
      setQueueReloadKey((key) => key + 1);
    }
  }, []);

  const labels = useMemo(() => {
    const set = new Set<string>();
    confusion.forEach((r: any) => {
      if (r.true_label) set.add(r.true_label);
      if (r.predicted_label) set.add(r.predicted_label);
    });
    return Array.from(set).sort();
  }, [confusion]);

  const matrix = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    labels.forEach((t) => {
      map[t] = {};
      labels.forEach((p) => {
        map[t][p] = 0;
      });
    });

    confusion.forEach((r: any) => {
      if (!map[r.true_label]) {
        map[r.true_label] = {};
      }
      if (map[r.true_label][r.predicted_label] === undefined) {
        map[r.true_label][r.predicted_label] = 0;
      }
      map[r.true_label][r.predicted_label] += r.n;
    });

    return map;
  }, [confusion, labels]);

  const maxCell = useMemo(() => {
    let max = 0;
    labels.forEach((t) => {
      labels.forEach((p) => {
        max = Math.max(max, matrix?.[t]?.[p] ?? 0);
      });
    });
    return max;
  }, [matrix, labels]);

  const saveThreshold = async () => {
    if (!model) {
      return;
    }

    await fetch("/api/ai/eval/threshold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_version: model, label: targetLabel, threshold }),
    });
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading AI evaluation metrics...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <AutomationStatus />
        <LabelingCounters refreshKey={queueReloadKey} />
      </div>

      <LabelSprint onBatchLoaded={handleBatchLoaded} />

      <PiiPanel />

      <div className="grid gap-6 lg:grid-cols-2">
        <LiveTelemetry />
        <ReviewQueue reloadKey={queueReloadKey} />
      </div>

      <PromotionPanel latestCandidate={metrics?.[0]?.model_version} />

      <Card>
        <CardHeader>
          <CardTitle>Model Accuracy Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={metrics}>
              <XAxis dataKey="model_version" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="accuracy" fill="#facc15" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detailed Evaluation Results</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model Version</TableHead>
                <TableHead>Eval Set</TableHead>
                <TableHead>Accuracy</TableHead>
                <TableHead>Total Samples</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((m) => (
                <TableRow key={m.model_version + m.eval_set}>
                  <TableCell>{m.model_version}</TableCell>
                  <TableCell>{m.eval_set}</TableCell>
                  <TableCell>{(m.accuracy * 100).toFixed(1)}%</TableCell>
                  <TableCell>{m.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EvalSetManager defaultModel={metrics?.[0]?.model_version} />

      <Card>
        <CardHeader className="flex flex-col gap-2">
          <CardTitle>Confusion Matrix {model ? `— ${model}` : ""}</CardTitle>
          <div className="text-sm text-muted-foreground">Rows = true labels, Columns = predicted labels</div>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="min-w-max border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="px-2 py-1" />
                {labels.map((l) => (
                  <th key={`pred-${l}`} className="px-2 py-1 text-sm text-muted-foreground">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((t) => (
                <tr key={`true-${t}`}>
                  <th className="px-2 py-1 text-right text-sm text-muted-foreground">{t}</th>
                  {labels.map((p) => (
                    <HeatCell key={`${t}|${p}`} value={matrix?.[t]?.[p] ?? 0} max={maxCell} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-Label Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>TP</TableHead>
                <TableHead>FP</TableHead>
                <TableHead>FN</TableHead>
                <TableHead>Precision</TableHead>
                <TableHead>Recall</TableHead>
                <TableHead>F1</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perLabel.map((row: any) => (
                <TableRow key={row.label}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell>{row.tp}</TableCell>
                  <TableCell>{row.fp}</TableCell>
                  <TableCell>{row.fn}</TableCell>
                  <TableCell>{row.precision ? `${(row.precision * 100).toFixed(1)}%` : "—"}</TableCell>
                  <TableCell>{row.recall ? `${(row.recall * 100).toFixed(1)}%` : "—"}</TableCell>
                  <TableCell>{row.f1 ? `${(row.f1 * 100).toFixed(1)}%` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Threshold — {targetLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Move right to reduce false positives (higher precision), left to reduce false negatives (higher recall).
          </div>
          <div className="flex items-center gap-4">
            <div className="w-full max-w-xl">
              <Slider
                value={[Number.isFinite(threshold) ? Math.round(threshold * 1000) / 1000 : 0]}
                min={0}
                max={1}
                step={0.005}
                onValueChange={(values) => {
                  if (values[0] !== undefined) {
                    setThreshold(values[0]);
                  }
                }}
              />
            </div>
            <div className="w-16 text-right">{Number.isFinite(threshold) ? threshold.toFixed(3) : "—"}</div>
            <Button onClick={saveThreshold} disabled={!model}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <RetrainControls defaultModel={metrics?.[0]?.model_version} />
    </div>
  );
}

function JobsTable() {
  const [jobs, setJobs] = useState<any[]>([]);

  const load = async () => {
    const res = await fetch("/api/ai/train/jobs");
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    setJobs(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-muted-foreground">
            <th className="px-2 py-1 text-left">Created</th>
            <th className="px-2 py-1 text-left">Model</th>
            <th className="px-2 py-1 text-left">Status</th>
            <th className="px-2 py-1 text-left">Dataset</th>
            <th className="px-2 py-1 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="px-2 py-1">{j.created_at ? new Date(j.created_at).toLocaleString() : "—"}</td>
              <td className="px-2 py-1">{j.target_model_version}</td>
              <td className="px-2 py-1">{j.status}</td>
              <td className="px-2 py-1">{j.dataset_uri || "—"}</td>
              <td className="px-2 py-1">
                {j.status === "queued" ? (
                  <Button
                    size="sm"
                    onClick={async () => {
                      await fetch("/api/ai/train/dispatch", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ job_id: j.id }),
                      });
                      await load();
                    }}
                  >
                    Dispatch Train
                  </Button>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RetrainControls({ defaultModel }: { defaultModel?: string }) {
  const [mv, setMv] = useState(defaultModel || "replyclf_v0.0.1");
  const [seed, setSeed] = useState(42);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retrain Builder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="grow">
            <label className="text-sm text-muted-foreground">Target Model Version</label>
            <Input value={mv} onChange={(e) => setMv(e.target.value)} placeholder="replyclf_v0.6.4" />
          </div>
          <div className="w-full max-w-[8rem]">
            <label className="text-sm text-muted-foreground">Seed</label>
            <Input
              type="number"
              value={seed}
              onChange={(e) => {
                const value = parseInt(e.target.value || "42", 10);
                setSeed(Number.isFinite(value) ? value : 42);
              }}
            />
          </div>
          <Button
            onClick={async () => {
              await fetch("/api/ai/train/build", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target_model_version: mv, seed }),
              });
              window.location.reload();
            }}
          >
            Build Dataset &amp; Queue
          </Button>
        </div>
        <JobsTable />
      </CardContent>
    </Card>
  );
}

