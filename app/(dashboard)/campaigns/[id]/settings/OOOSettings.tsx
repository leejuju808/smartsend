"use client";

import * as React from "react";
import useSWR from "swr";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type CampaignSettingsResponse = {
  item: {
    ooo_resume_enabled?: boolean | null;
    ooo_resume_delay_hours?: number | null;
  } | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function OOOSettings({ campaignId }: { campaignId: string }) {
  const { data, mutate, isLoading } = useSWR<CampaignSettingsResponse>(
    `/api/campaigns/${campaignId}/settings`,
    fetcher
  );
  const [enabled, setEnabled] = React.useState(true);
  const [delay, setDelay] = React.useState(24);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!data?.item) return;
    setEnabled(Boolean(data.item.ooo_resume_enabled ?? true));
    setDelay(data.item.ooo_resume_delay_hours ?? 24);
  }, [data?.item]);

  async function save() {
    setSaving(true);
    try {
      const body = {
        ooo_resume_enabled: enabled,
        ooo_resume_delay_hours: Number.isFinite(delay) ? delay : 24,
      };

      const res = await fetch(`/api/campaigns/${campaignId}/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error("Failed to save settings");
      }

      await mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Auto-resume OOO leads</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={isLoading || saving} />
      </div>
      <div className="grid gap-1">
        <label className="text-sm text-muted-foreground">Resume drip delay (hours)</label>
        <Input
          type="number"
          min={1}
          max={168}
          value={Number.isFinite(delay) ? delay : ""}
          onChange={(event) => {
            const next = Number(event.target.value || 24);
            setDelay(Number.isFinite(next) ? Math.max(1, Math.min(168, Math.round(next))) : 24);
          }}
          disabled={isLoading || saving}
        />
      </div>
      <Button onClick={save} disabled={saving || isLoading}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}





