"use client";

import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

interface AutoOptimizeToggleProps {
  campaignId: string;
}

export function AutoOptimizeToggle({ campaignId }: AutoOptimizeToggleProps) {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSetting();
  }, [campaignId]);

  async function loadSetting() {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch campaign");
      }
      const data = await response.json();
      setEnabled(!!data.campaign?.auto_optimize);
    } catch (error) {
      console.error("Error loading auto-optimize setting:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(checked: boolean) {
    setSaving(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/toggle-auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: checked }),
      });

      if (!response.ok) {
        throw new Error("Failed to update setting");
      }

      setEnabled(checked);
    } catch (error) {
      console.error("Error saving auto-optimize setting:", error);
      // Revert on error
      setEnabled(!checked);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label htmlFor="auto-optimize" className="text-sm font-medium">
            Auto-Optimize Variants
          </Label>
          <p className="text-xs text-muted-foreground">
            Automatically shift traffic toward winning variants and pause under-performing ones
          </p>
        </div>
        <Switch
          id="auto-optimize"
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={saving}
        />
      </div>
    </Card>
  );
}

