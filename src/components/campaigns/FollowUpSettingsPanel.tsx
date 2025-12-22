"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type FollowUpSettings = {
  enabled: boolean;
  max_follow_ups: number;
  fu_1_delay_hours: number;
  fu_2_delay_hours: number;
  fu_3_delay_hours: number;
  fu_4_delay_hours: number;
  stop_on_reply: boolean;
  auto_send_warm: boolean;
  auto_send_hot: boolean;
};

type FollowUpSettingsPanelProps = {
  campaignId: string;
  initialSettings?: FollowUpSettings | null;
};

const DEFAULT_SETTINGS: FollowUpSettings = {
  enabled: true,
  max_follow_ups: 4,
  fu_1_delay_hours: 48,
  fu_2_delay_hours: 96,
  fu_3_delay_hours: 168,
  fu_4_delay_hours: 336,
  stop_on_reply: true,
  auto_send_warm: true,
  auto_send_hot: true,
};

export function FollowUpSettingsPanel({
  campaignId,
  initialSettings,
}: FollowUpSettingsPanelProps) {
  const router = useRouter();

  const [settings, setSettings] = useState<FollowUpSettings>(
    initialSettings ?? DEFAULT_SETTINGS
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSliderChange = (value: number[]) => {
    setSettings((prev) => ({
      ...prev,
      max_follow_ups: value[0],
    }));
  };

  const handleNumberChange = (key: keyof FollowUpSettings) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value || "0", 10);
      setSettings((prev) => ({
        ...prev,
        [key]: Number.isNaN(val) ? 0 : val,
      }));
    };

  const handleToggle =
    (key: keyof FollowUpSettings) =>
    (checked: boolean) => {
      setSettings((prev) => ({
        ...prev,
        [key]: checked as any,
      }));
    };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSaved(false);

      const res = await fetch(
        `/api/campaigns/${campaignId}/follow-up-settings`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settings),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save settings");
      }

      setSaved(true);
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong");
    } finally {
      setSaving(false);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Follow-Up Automation</CardTitle>
        <CardDescription>
          Control how SmartSend automatically follows up with homeowners for this campaign.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Enable Follow-Ups</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, SmartSend will automatically send follow-up emails
              using your roofing sequence.
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={handleToggle("enabled")}
          />
        </div>

        <Separator />

        {/* Follow-up count */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base">Number of Follow-Ups</Label>
            <span className="text-sm font-medium">
              {settings.max_follow_ups} follow-up
              {settings.max_follow_ups === 1 ? "" : "s"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Choose how many follow-ups SmartSend should send after the first email.
          </p>
          <Slider
            min={0}
            max={4}
            step={1}
            value={[settings.max_follow_ups]}
            onValueChange={handleSliderChange}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0</span>
            <span>1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
          </div>
        </div>

        <Separator />

        {/* Timing simple view */}
        <div className="space-y-3">
          <Label className="text-base">Timing</Label>
          <p className="text-sm text-muted-foreground">
            Default schedule based on what works best for roofing campaigns.
          </p>
          <div className="rounded-xl border bg-muted/40 p-3 text-sm space-y-1">
            <div>
              <span className="font-medium">Follow-Up #1:</span> after{" "}
              <span className="font-semibold">
                {settings.fu_1_delay_hours / 24} days
              </span>{" "}
              (≈ {settings.fu_1_delay_hours} hours)
            </div>
            <div>
              <span className="font-medium">Follow-Up #2:</span> after{" "}
              <span className="font-semibold">
                {settings.fu_2_delay_hours / 24} days
              </span>{" "}
              (≈ {settings.fu_2_delay_hours} hours)
            </div>
            <div>
              <span className="font-medium">Follow-Up #3:</span> after{" "}
              <span className="font-semibold">
                {settings.fu_3_delay_hours / 24} days
              </span>{" "}
              (≈ {settings.fu_3_delay_hours} hours)
            </div>
            <div>
              <span className="font-medium">Final Follow-Up:</span> after{" "}
              <span className="font-semibold">
                {settings.fu_4_delay_hours / 24} days
              </span>{" "}
              (≈ {settings.fu_4_delay_hours} hours)
            </div>
          </div>

          <button
            type="button"
            className="text-xs font-medium text-primary underline underline-offset-4"
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            {advancedOpen ? "Hide advanced timing" : "Customize timing (advanced)"}
          </button>
        </div>

        {/* Advanced timing inputs */}
        {advancedOpen && (
          <div className="space-y-3 rounded-xl border bg-background p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fu_1_delay_hours">Follow-Up #1 Delay (hours)</Label>
                <Input
                  id="fu_1_delay_hours"
                  type="number"
                  min={0}
                  value={settings.fu_1_delay_hours}
                  onChange={handleNumberChange("fu_1_delay_hours")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fu_2_delay_hours">Follow-Up #2 Delay (hours)</Label>
                <Input
                  id="fu_2_delay_hours"
                  type="number"
                  min={0}
                  value={settings.fu_2_delay_hours}
                  onChange={handleNumberChange("fu_2_delay_hours")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fu_3_delay_hours">Follow-Up #3 Delay (hours)</Label>
                <Input
                  id="fu_3_delay_hours"
                  type="number"
                  min={0}
                  value={settings.fu_3_delay_hours}
                  onChange={handleNumberChange("fu_3_delay_hours")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fu_4_delay_hours">Final Follow-Up Delay (hours)</Label>
                <Input
                  id="fu_4_delay_hours"
                  type="number"
                  min={0}
                  value={settings.fu_4_delay_hours}
                  onChange={handleNumberChange("fu_4_delay_hours")}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: most roofing campaigns perform best with 2–4 follow-ups spread across 7–14 days.
            </p>
          </div>
        )}

        <Separator />

        {/* Reply behavior */}
        <div className="space-y-4">
          <Label className="text-base">When a homeowner replies</Label>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Stop all follow-ups</p>
              <p className="text-xs text-muted-foreground">
                Prevents over-sending once someone writes back.
              </p>
            </div>
            <Switch
              checked={settings.stop_on_reply}
              onCheckedChange={handleToggle("stop_on_reply")}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Auto-reply to warm leads</p>
              <p className="text-xs text-muted-foreground">
                Sends a friendly response with your booking link when someone shows interest.
              </p>
            </div>
            <Switch
              checked={settings.auto_send_warm}
              onCheckedChange={handleToggle("auto_send_warm")}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Prioritize hot leads</p>
              <p className="text-xs text-muted-foreground">
                Instantly sends a confirmation + pushes this lead to the top of your inbox.
              </p>
            </div>
            <Switch
              checked={settings.auto_send_hot}
              onCheckedChange={handleToggle("auto_send_hot")}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="text-sm text-emerald-600">
            Follow-up settings saved.
          </p>
        )}
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            setSettings(initialSettings ?? DEFAULT_SETTINGS);
            setError(null);
            setSaved(false);
          }}
        >
          Reset
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </CardFooter>
    </Card>
  );
}

