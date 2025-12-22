"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function CampaignSharingCard({
  campaignId,
  initialIsShared,
}: {
  campaignId: string;
  initialIsShared: boolean;
}) {
  const [value, setValue] = useState(initialIsShared);
  const [saving, setSaving] = useState(false);

  const toggle = async (checked: boolean) => {
    setValue(checked);
    setSaving(true);
    const res = await fetch(`/api/campaigns/${campaignId}/sharing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_shared: checked }),
    });
    // you could handle error + revert state here if needed
    if (!res.ok) {
      const error = await res.json();
      console.error("Failed to update sharing:", error);
      // Revert on error
      setValue(!checked);
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Team sharing</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between text-xs">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">Share with workspace</Label>
          <p className="text-[11px] text-muted-foreground">
            When enabled, all teammates in this workspace can see and use this
            campaign. When disabled, only you (and admins) can see it.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Switch
            checked={value}
            onCheckedChange={toggle}
            disabled={saving}
          />
          <span className="text-[10px] text-muted-foreground">
            {saving ? "Saving…" : value ? "Shared" : "Private"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}






