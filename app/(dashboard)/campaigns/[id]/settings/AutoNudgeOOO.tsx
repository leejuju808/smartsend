"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type AutoNudgeProps = {
  initial: boolean;
  campaignId: string;
};

export function AutoNudgeOOO({ initial, campaignId }: AutoNudgeProps) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(val: boolean) {
    const previous = on;
    setOn(val);
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/ooo-autonudge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: val }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error ?? "Unable to update auto-nudge setting.");
      }

      if (payload && typeof payload.enabled === "boolean") {
        setOn(payload.enabled);
      }
    } catch (err) {
      console.error("Failed to toggle OOO auto-nudge", err);
      setOn(previous);
      setError(err instanceof Error ? err.message : "Failed to update auto-nudge.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Switch checked={on} onCheckedChange={save} disabled={saving} />
        <Label className="text-sm">Enable OOO Auto-Nudge</Label>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

