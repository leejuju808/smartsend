"use client";

import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/Card";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface AISDRToggleProps {
  campaignId: string;
}

export function AISDRToggle({ campaignId }: AISDRToggleProps) {
  const supabase = createClientComponentClient();
  const [enabled, setEnabled] = useState<boolean>(false);
  const [mode, setMode] = useState<"autopilot" | "review">("autopilot");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [campaignId]);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select("ai_sdr_enabled, ai_sdr_mode")
        .eq("id", campaignId)
        .single();

      if (error) throw error;

      setEnabled(data?.ai_sdr_enabled ?? false);
      setMode((data?.ai_sdr_mode as "autopilot" | "review") ?? "autopilot");
    } catch (error) {
      console.error("Error loading AI SDR settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleEnabled(checked: boolean) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("campaigns")
        .update({ ai_sdr_enabled: checked })
        .eq("id", campaignId);

      if (error) throw error;
      setEnabled(checked);
    } catch (error) {
      console.error("Error saving AI SDR enabled:", error);
      setEnabled(!checked); // Revert on error
    } finally {
      setSaving(false);
    }
  }

  async function handleModeChange(newMode: "autopilot" | "review") {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("campaigns")
        .update({ ai_sdr_mode: newMode })
        .eq("id", campaignId);

      if (error) throw error;
      setMode(newMode);
    } catch (error) {
      console.error("Error saving AI SDR mode:", error);
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
      <CardContent className="space-y-4 p-0">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="ai-sdr-enabled" className="text-sm font-medium">
              Enable AI SDR for this Campaign
            </Label>
            <p className="text-xs text-muted-foreground">
              Allow AI SDR to automatically follow up, reply to interest, and revive leads for this campaign
            </p>
          </div>
          <Switch
            id="ai-sdr-enabled"
            checked={enabled}
            onCheckedChange={handleToggleEnabled}
            disabled={saving}
          />
        </div>

        {enabled && (
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-sm font-medium">AI SDR Mode</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Choose how AI SDR handles actions for this campaign
            </p>
            <div className="flex gap-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name={`ai-sdr-mode-${campaignId}`}
                  value="autopilot"
                  checked={mode === "autopilot"}
                  onChange={() => handleModeChange("autopilot")}
                  disabled={saving}
                  className="w-4 h-4"
                />
                <span className="text-sm">Autopilot (send automatically)</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name={`ai-sdr-mode-${campaignId}`}
                  value="review"
                  checked={mode === "review"}
                  onChange={() => handleModeChange("review")}
                  disabled={saving}
                  className="w-4 h-4"
                />
                <span className="text-sm">Review first (add to queue)</span>
              </label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


