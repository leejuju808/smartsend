"use client";

import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface SpeedToLeadToggleProps {
  campaignId: string;
}

export function SpeedToLeadToggle({ campaignId }: SpeedToLeadToggleProps) {
  const supabase = createClientComponentClient();
  const [enabled, setEnabled] = useState<boolean>(false);
  const [delaySeconds, setDelaySeconds] = useState<number>(300);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, [campaignId]);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select("speed_to_lead_enabled, speed_to_lead_delay_seconds, speed_to_lead_intents")
        .eq("id", campaignId)
        .single();

      if (error) throw error;

      setEnabled(data?.speed_to_lead_enabled ?? false);
      setDelaySeconds(data?.speed_to_lead_delay_seconds ?? 300);
    } catch (error) {
      console.error("Error loading speed-to-lead settings:", error);
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("campaigns")
        .update({
          speed_to_lead_enabled: enabled,
          speed_to_lead_delay_seconds: Math.max(60, Math.min(3600, delaySeconds || 300)),
          speed_to_lead_intents: ["positive", "referral"], // Fixed for v1
        })
        .eq("id", campaignId);

      if (updateError) throw updateError;
    } catch (error) {
      console.error("Error saving speed-to-lead settings:", error);
      setError("Failed to save settings");
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
            <Label htmlFor="speed-to-lead-enabled" className="text-sm font-medium">
              Speed-to-Lead
            </Label>
            <p className="text-xs text-muted-foreground">
              Automatically send a follow-up when a hot reply comes in (positive or referral).
            </p>
          </div>
          <Switch
            id="speed-to-lead-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={saving}
          />
        </div>

        {enabled && (
          <>
            <div className="space-y-2 pt-2 border-t">
              <Label htmlFor="delay-seconds" className="text-xs font-medium text-muted-foreground">
                Delay before sending
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="delay-seconds"
                  type="number"
                  min={60}
                  max={3600}
                  className="w-28"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value) || 300)}
                />
                <span className="text-xs text-muted-foreground">
                  seconds (e.g., 300 = 5 minutes)
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Triggers on intents
              </Label>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default" className="text-[11px]">
                  positive
                </Badge>
                <Badge variant="secondary" className="text-[11px]">
                  referral
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  (more options coming later)
                </span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground/80">
              Speed-to-lead uses your Smart Reply Draft engine to generate a short, professional
              reply and sends it automatically, respecting your daily send limits.
            </p>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="text-sm"
              >
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}































































