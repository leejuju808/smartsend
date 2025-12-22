"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ProviderStatus = {
  email: string | null;
  last_synced_at?: string | null;
};

type StatusResponse = Record<string, ProviderStatus>;

export default function IntegrationsPage() {
  const [status, setStatus] = React.useState<StatusResponse | null>(null);

  React.useEffect(() => {
    fetch("/api/me/integrations/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  const renderProvider = (
    provider: "google" | "outlook",
    label: string
  ) => {
    const info = status?.[provider];
    if (!info) {
      return `${label}: Not connected`;
    }
    const lastSynced = info.last_synced_at
      ? ` (last synced ${new Date(info.last_synced_at).toLocaleString()})`
      : "";
    return `✅ ${label}: ${info.email}${lastSynced}`;
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Integrations</h1>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="font-medium">Calendar</div>
            <p className="text-sm text-muted-foreground">
              Connect Google or Outlook to block times automatically.
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/api/oauth/google/connect">
              <Button variant="outline">Connect Google</Button>
            </a>
            <a href="/api/oauth/outlook/connect">
              <Button variant="outline">Connect Outlook</Button>
            </a>
          </div>
        </div>
        <div className="text-sm">
          <div>{renderProvider("google", "Google")}</div>
          <div>{renderProvider("outlook", "Outlook")}</div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              const r = await fetch("/api/me/calendar/sync-now", {
                method: "POST",
              });
              const j = await r.json();
              alert(
                (j as { ok?: boolean; error?: string }).ok
                  ? "Sync started."
                  : `Sync failed: ${(j as { error?: string }).error || "unknown"}`
              );
            }}
          >
            Sync now
          </Button>
        </div>
      </Card>
    </div>
  );
}


