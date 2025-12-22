"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type HarnessResponse = {
  ok: boolean;
  caseA?: Record<string, number>;
  error?: string;
};

export function SchedulerHarnessCard({ accountId }: { accountId: string }) {
  const [out, setOut] = useState<HarnessResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const r = await fetch("/api/qa/scheduler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
      });

      const j = (await r.json()) as HarnessResponse;
      setOut(j);
    } catch (error: any) {
      setOut({ ok: false, error: error?.message ?? "Failed to execute harness" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduler QA Harness</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Button size="sm" onClick={run} disabled={loading}>
          {loading ? "Running..." : "Seed & Probe"}
        </Button>
        {out && (
          <div className="text-xs space-y-1">
            <div>Case A counts:</div>
            <pre className="bg-muted p-2 rounded">{JSON.stringify(out.caseA ?? out, null, 2)}</pre>
            {!out.ok && out.error && <div className="text-destructive">Error: {out.error}</div>}
          </div>
        )}
        <div className="text-xs opacity-70">
          After running Case A, use Case B/C by executing the SQL seeds directly and then call your domain
          reputation update function to verify cooldown behaviour after simulated bounces.
        </div>
      </CardContent>
    </Card>
  );
}

