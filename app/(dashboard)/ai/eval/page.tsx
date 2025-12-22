'use client';

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type MetricRow = {
  eval_set_id: string;
  model_name: string;
  version_tag: string;
  accuracy: number;
  avg_latency_ms: number;
  n: number;
  created_at: string;
};

export default function EvalPage() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSetId, setLastSetId] = useState<string | null>(null);

  const refreshMetrics = async () => {
    try {
      const res = await fetch("/api/ai/eval/metrics");
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Failed to fetch metrics");
        return;
      }
      setMetrics(data.data ?? []);
    } catch (error) {
      toast.error((error as Error).message ?? "Unexpected error");
    }
  };

  useEffect(() => {
    refreshMetrics();
  }, []);

  const generateSet = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/eval/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size: 200 }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Generate failed");
        return;
      }
      setLastSetId(data.eval_set_id ?? null);
      toast.success("Eval set generated");
    } catch (error) {
      toast.error((error as Error).message ?? "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const runEval = async () => {
    if (!lastSetId) {
      toast.error("Generate an eval set first");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ai/eval/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eval_set_id: lastSetId, model_version_tag: "v1.0.0" }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Eval failed");
        return;
      }
      toast.success("Eval complete");
      await refreshMetrics();
    } catch (error) {
      toast.error((error as Error).message ?? "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Eval Controls</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <Button onClick={generateSet} disabled={loading}>
            Generate Eval Set (200)
          </Button>
          <Button onClick={runEval} variant="secondary" disabled={loading || !lastSetId}>
            Run Eval on v1.0.0
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground mb-3">
            Accuracy &amp; latency per model/version
          </div>
          {metrics.length === 0 ? (
            <div className="text-sm text-muted-foreground">No evals yet.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {metrics.map((metric) => (
                <div key={`${metric.model_name}-${metric.version_tag}-${metric.eval_set_id}`} className="rounded-2xl border p-4">
                  <div className="font-medium">
                    {metric.model_name} — {metric.version_tag}
                  </div>
                  <div className="text-xs text-muted-foreground">Eval: {metric.eval_set_id}</div>
                  <div className="mt-2 text-sm">
                    Accuracy: {Number.isFinite(metric.accuracy) ? (metric.accuracy * 100).toFixed(1) : "–"}%
                  </div>
                  <div className="text-sm">Avg Latency: {metric.avg_latency_ms ?? 0} ms</div>
                  <div className="text-xs">n={metric.n}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



















