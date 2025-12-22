"use client";

import * as React from "react";

import { Button } from "@/components/ui/Button";

export function EnrichmentStatus() {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string>("");

  async function run() {
    setBusy(true);
    setMsg("");

    try {
      const res = await fetch("/api/enrich/now", { method: "POST" });
      const payload = await res.json();

      if (!res.ok) {
        setMsg(payload?.error ?? "Failed to refresh");
      } else {
        setMsg(`Processed ${payload?.processed ?? 0}`);
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={run} disabled={busy}>
        {busy ? "Refreshing…" : "Enrich Now"}
      </Button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
