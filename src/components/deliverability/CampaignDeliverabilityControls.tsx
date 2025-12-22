// src/components/deliverability/CampaignDeliverabilityControls.tsx
// Campaign-level throttle knobs: daily cap, thresholds, warn/block sliders

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/Input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/Button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

interface CampaignSettings {
  id: string;
  name: string;
  max_daily_sends_per_mailbox: number;
  bounce_halt_threshold: number;
  complaint_halt_threshold: number;
  risk_block_threshold: number;
  risk_warn_threshold: number;
}

export function CampaignDeliverabilityControls({ campaignId }: { campaignId: string }) {
  const supabase = createClientComponentClient();
  const [settings, setSettings] = useState<CampaignSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from("campaigns")
          .select("id, name, max_daily_sends_per_mailbox, bounce_halt_threshold, complaint_halt_threshold, risk_block_threshold, risk_warn_threshold")
          .eq("id", campaignId)
          .single();

        if (error) throw error;

        setSettings({
          id: data.id,
          name: data.name || "Campaign",
          max_daily_sends_per_mailbox: data.max_daily_sends_per_mailbox ?? 200,
          bounce_halt_threshold: data.bounce_halt_threshold ?? 0.05,
          complaint_halt_threshold: data.complaint_halt_threshold ?? 0.002,
          risk_block_threshold: data.risk_block_threshold ?? 0.75,
          risk_warn_threshold: data.risk_warn_threshold ?? 0.55,
        });
      } catch (err) {
        console.error("Error loading campaign settings:", err);
        toast.error("Failed to load campaign settings");
      } finally {
        setLoading(false);
      }
    }

    if (campaignId) {
      load();
    }
  }, [campaignId, supabase]);

  async function handleSave() {
    if (!settings) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("campaigns")
        .update({
          max_daily_sends_per_mailbox: settings.max_daily_sends_per_mailbox,
          bounce_halt_threshold: settings.bounce_halt_threshold,
          complaint_halt_threshold: settings.complaint_halt_threshold,
          risk_block_threshold: settings.risk_block_threshold,
          risk_warn_threshold: settings.risk_warn_threshold,
        })
        .eq("id", campaignId);

      if (error) throw error;

      toast.success("Settings saved");
    } catch (err: any) {
      console.error("Error saving settings:", err);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Deliverability Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Deliverability Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Campaign not found</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deliverability Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label htmlFor="daily_cap">Max Daily Sends Per Mailbox</Label>
          <Input
            id="daily_cap"
            type="number"
            value={settings.max_daily_sends_per_mailbox}
            onChange={(e) =>
              setSettings({
                ...settings,
                max_daily_sends_per_mailbox: parseInt(e.target.value) || 200,
              })
            }
            className="mt-1"
          />
        </div>

        <div>
          <Label>Bounce Halt Threshold: {(settings.bounce_halt_threshold * 100).toFixed(1)}%</Label>
          <Slider
            value={[settings.bounce_halt_threshold]}
            onValueChange={([v]) =>
              setSettings({ ...settings, bounce_halt_threshold: v })
            }
            min={0}
            max={0.2}
            step={0.01}
            className="mt-2"
          />
          <div className="text-xs text-muted-foreground mt-1">
            Campaign halts if bounce rate exceeds this threshold
          </div>
        </div>

        <div>
          <Label>Complaint Halt Threshold: {(settings.complaint_halt_threshold * 100).toFixed(2)}%</Label>
          <Slider
            value={[settings.complaint_halt_threshold]}
            onValueChange={([v]) =>
              setSettings({ ...settings, complaint_halt_threshold: v })
            }
            min={0}
            max={0.01}
            step={0.0001}
            className="mt-2"
          />
          <div className="text-xs text-muted-foreground mt-1">
            Campaign halts if complaint rate exceeds this threshold
          </div>
        </div>

        <div>
          <Label>Risk Block Threshold: {(settings.risk_block_threshold * 100).toFixed(0)}%</Label>
          <Slider
            value={[settings.risk_block_threshold]}
            onValueChange={([v]) =>
              setSettings({ ...settings, risk_block_threshold: v })
            }
            min={0}
            max={1}
            step={0.05}
            className="mt-2"
          />
          <div className="text-xs text-muted-foreground mt-1">
            Messages blocked if spam risk exceeds this threshold
          </div>
        </div>

        <div>
          <Label>Risk Warn Threshold: {(settings.risk_warn_threshold * 100).toFixed(0)}%</Label>
          <Slider
            value={[settings.risk_warn_threshold]}
            onValueChange={([v]) =>
              setSettings({ ...settings, risk_warn_threshold: v })
            }
            min={0}
            max={1}
            step={0.05}
            className="mt-2"
          />
          <div className="text-xs text-muted-foreground mt-1">
            Warning shown if spam risk exceeds this threshold
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}

