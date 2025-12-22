'use client';

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type RegressionRun = {
  id: string;
  created_at: string;
  bundle_id: string;
  bundle_name: string;
  challenger_version_tag: string;
  baseline_version_tag: string | null;
  passed: boolean | null;
  summary: {
    failures?: Array<{
      reason: string;
      label?: string;
      eval_set_id?: string;
      precision?: number;
      recall?: number;
      challenger_f1?: number;
      baseline_f1?: number;
    }>;
  } | null;
};

export default function RegressionPage() {
  const [bundleId, setBundleId] = useState("");
  const [challenger, setChallenger] = useState("v1.1.0");
  const [baseline, setBaseline] = useState("v1.0.0");
  const [runs, setRuns] = useState<RegressionRun[]>([]);
  const [loading, setLoading] = useState(false);

  const runRegression = async () => {
    if (!bundleId) {
      toast.error("Select a bundle");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/ai/regression/run", {
        method: "POST",
        body: JSON.stringify({
          bundle_id: bundleId,
          challenger_version_tag: challenger,
          baseline_version_tag: baseline,
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "Regression failed to start");
      } else {
        toast.success(j.passed ? "Passed ✅" : `Failed ❌ (${j.failures} issues)`);
        await loadRuns();
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async () => {
    const r = await fetch("/api/ai/regression/runs");
    const j = await r.json();
    if (!j.ok) {
      toast.error(j.error ?? "Failed to load runs");
      return;
    }
    setRuns(j.data ?? []);
  };

  useEffect(() => {
    loadRuns();
  }, []);

  return (
    <div className="p-6 grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Regression Runner</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-5 gap-2">
          <Input
            placeholder="bundle_id"
            value={bundleId}
            onChange={(e) => setBundleId(e.target.value)}
          />
          <Input
            placeholder="challenger version tag"
            value={challenger}
            onChange={(e) => setChallenger(e.target.value)}
          />
          <Input
            placeholder="baseline version tag"
            value={baseline}
            onChange={(e) => setBaseline(e.target.value)}
          />
          <Button onClick={runRegression} disabled={loading}>
            {loading ? "Running..." : "Run Regression"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {runs.map((run) => (
            <div
              key={run.id}
              className={`rounded-2xl border p-4 ${run.passed ? "border-green-500" : "border-red-500"}`}
            >
              <div className="text-sm">
                <b>{run.challenger_version_tag}</b> vs {run.baseline_version_tag || "-"} on{" "}
                <i>{run.bundle_name}</i> - {run.passed ? "PASSED" : "FAILED"}
              </div>
              {run.summary?.failures?.length ? (
                <ul className="mt-2 text-xs list-disc pl-5">
                  {run.summary.failures.slice(0, 6).map((f, i) => (
                    <li key={`${run.id}-${i}`}>
                      {f.reason}: {f.label ?? "-"} (set {String(f.eval_set_id ?? "").slice(0, 6)}...)
                      {typeof f.precision === "number" ? ` p=${(f.precision * 100).toFixed(1)}%` : ""}
                      {typeof f.recall === "number" ? ` r=${(f.recall * 100).toFixed(1)}%` : ""}
                      {typeof f.challenger_f1 === "number" ? ` f1=${(f.challenger_f1 * 100).toFixed(1)}%` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          {!runs.length ? <div className="text-sm text-muted-foreground">No runs yet.</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}

