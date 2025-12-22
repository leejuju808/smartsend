"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Decision = {
  id: string;
  created_at: string;
  created_by: string | null;
  decision_type: string;
  choice: "act" | "accept";
  action_label: string;
  proposed_changes: any;
};

export default function ControlTowerClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/decisions", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load decisions");
      setDecisions((json.decisions || []) as Decision[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load decisions");
      setDecisions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Control Tower</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            If it’s not visible here, it’s not a real decision.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/os">
            <Button variant="outline">OS Levers</Button>
          </Link>
          <Link href="/dashboard/owner">
            <Button variant="outline">Owner Control</Button>
          </Link>
          <Button variant="outline" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Decision log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
          {!loading && decisions.length === 0 ? (
            <div className="text-sm text-muted-foreground">No decisions recorded yet.</div>
          ) : null}
          {decisions.map((d) => (
            <div key={d.id} className="rounded-lg border bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {d.action_label || d.decision_type}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(d.created_at).toLocaleString()} • {d.decision_type}
                  </div>
                </div>
                <div className={`text-xs font-bold ${d.choice === "act" ? "text-emerald-700" : "text-slate-700"}`}>
                  {d.choice.toUpperCase()}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}



