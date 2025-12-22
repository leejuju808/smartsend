"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SyncNowButton({ accountId }: { accountId: string }) {
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = await fetch(`/api/account/${accountId}/sync`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) toast.success("Sync triggered");
      else toast.error("Sync failed");
    } catch (error) {
      console.error("Sync failed", error);
      toast.error("Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy}>
      {busy ? "Syncing…" : "Sync now"}
    </Button>
  );
}


