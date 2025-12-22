"use client";

import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface AutopilotSettings {
  id?: string;
  org_id: string;
  enabled: boolean;
  daily_send_limit: number;
  quiet_hours: {
    start: string;
    end: string;
  };
  review_mode: boolean;
}

export default function AutopilotDashboard() {
  const [settings, setSettings] = useState<AutopilotSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localSettings, setLocalSettings] = useState<Partial<AutopilotSettings>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/autopilot-settings");
      if (!res.ok) {
        throw new Error("Failed to fetch settings");
      }
      const data = await res.json();
      setSettings(data);
      setLocalSettings(data);
    } catch (error) {
      console.error("Error fetching autopilot settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/autopilot-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localSettings),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Error: ${error.error}`);
        return;
      }

      const result = await res.json();
      setSettings(result.settings);
      setLocalSettings(result.settings);
      alert("✅ Settings saved successfully!");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("❌ Error saving settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p>Loading...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6">
        <p>No settings found. Please contact support.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🧠 Autopilot Control Center</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Configure AI Outreach automation with smart limits and safety guardrails
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Autopilot Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Autopilot Toggle */}
          <div className="flex justify-between items-center">
            <div>
              <span className="font-medium">Autopilot Mode</span>
              <p className="text-sm text-muted-foreground">
                Enable full AI outreach automation 24/7
              </p>
            </div>
            <Switch
              checked={localSettings.enabled ?? settings.enabled}
              onCheckedChange={(checked) =>
                setLocalSettings({ ...localSettings, enabled: checked })
              }
            />
          </div>

          {/* Daily Send Limit */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <label className="font-medium">Daily Send Limit</label>
                <p className="text-sm text-muted-foreground">
                  Maximum messages sent per day
                </p>
              </div>
              <span className="text-lg font-semibold">
                {localSettings.daily_send_limit ?? settings.daily_send_limit}
              </span>
            </div>
            <Slider
              min={10}
              max={500}
              step={10}
              value={[
                localSettings.daily_send_limit ?? settings.daily_send_limit,
              ]}
              onValueChange={([value]) =>
                setLocalSettings({ ...localSettings, daily_send_limit: value })
              }
            />
          </div>

          {/* Quiet Hours */}
          <div className="space-y-3">
            <label className="font-medium">Quiet Hours</label>
            <p className="text-sm text-muted-foreground">
              No messages sent during these hours
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">
                  Start
                </label>
                <Input
                  type="time"
                  value={
                    localSettings.quiet_hours?.start ?? settings.quiet_hours.start
                  }
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      quiet_hours: {
                        start: e.target.value,
                        end:
                          localSettings.quiet_hours?.end ??
                          settings.quiet_hours.end,
                      },
                    })
                  }
                />
              </div>
              <span className="pt-6">–</span>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">
                  End
                </label>
                <Input
                  type="time"
                  value={
                    localSettings.quiet_hours?.end ?? settings.quiet_hours.end
                  }
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      quiet_hours: {
                        start:
                          localSettings.quiet_hours?.start ??
                          settings.quiet_hours.start,
                        end: e.target.value,
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>

          {/* Review Mode */}
          <div className="flex justify-between items-center">
            <div>
              <span className="font-medium">Review Mode</span>
              <p className="text-sm text-muted-foreground">
                Require manual approval before sending AI drafts
              </p>
            </div>
            <Switch
              checked={localSettings.review_mode ?? settings.review_mode}
              onCheckedChange={(checked) =>
                setLocalSettings({ ...localSettings, review_mode: checked })
              }
            />
          </div>

          {/* Save Button */}
          <div className="pt-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle>Current Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Autopilot</span>
              <span
                className={`text-sm font-medium ${
                  settings.enabled ? "text-green-600" : "text-gray-500"
                }`}
              >
                {settings.enabled ? "🟢 Active" : "⚪ Inactive"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                Daily Limit
              </span>
              <span className="text-sm font-medium">
                {settings.daily_send_limit} messages/day
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Review Mode</span>
              <span
                className={`text-sm font-medium ${
                  settings.review_mode ? "text-yellow-600" : "text-green-600"
                }`}
              >
                {settings.review_mode ? "⏸️ Enabled" : "▶️ Disabled"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

