"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type Props = {
  campaignId: string;
};

export default function NudgeABToggle({ campaignId }: Props) {
  const [enabled, setEnabled] = React.useState<boolean>(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const resp = await fetch(`/api/campaign/${campaignId}/followup/ab-enabled`);
        const json = await resp.json().catch(() => ({}));
        if (!active) return;
        setEnabled(!!json?.ab_enabled);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [campaignId]);

  const save = React.useCallback(
    async (value: boolean) => {
      setEnabled(value);
      try {
        await fetch(`/api/campaign/${campaignId}/followup/ab-enabled`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ab_enabled: value }),
        });
      } catch {
        // ignore network errors; user can retry
      }
    },
    [campaignId],
  );

  return (
    <Card className="p-4 flex items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="font-semibold">Enable Nudge A/B</div>
        <div className="text-sm text-muted-foreground">
          When on, nudges route through weighted variant selection with assignment tracking.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="nudge-ab-toggle" className="text-sm">
          {loading ? "…" : enabled ? "On" : "Off"}
        </Label>
        <Switch
          id="nudge-ab-toggle"
          checked={enabled}
          disabled={loading}
          onCheckedChange={(value) => {
            setLoading(true);
            save(value).finally(() => setLoading(false));
          }}
        />
      </div>
    </Card>
  );
}

