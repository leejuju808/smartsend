"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

type SuppState = {
  respect_global_suppressions: boolean;
  respect_cross_campaign_unsubs: boolean;
  respect_domain_blocks: boolean;
};

export default function SuppressionToggles({
  initial,
  campaignId,
}: {
  initial: SuppState;
  campaignId: string;
}) {
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/campaigns/${campaignId}/prefs/suppression`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {[
        [
          "Respect global suppressions",
          "respect_global_suppressions",
        ],
        [
          "Respect cross-campaign unsubscribes",
          "respect_cross_campaign_unsubs",
        ],
        ["Respect domain blocks", "respect_domain_blocks"],
      ].map(([label, key]) => (
        <div
          key={key}
          className="flex items-center justify-between rounded-xl border p-4"
        >
          <div className="text-sm font-medium">{label}</div>
          <Switch
            checked={Boolean(state[key as keyof SuppState])}
            onCheckedChange={(v) =>
              setState((s) => ({ ...s, [key]: v }))
            }
          />
        </div>
      ))}
      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}












