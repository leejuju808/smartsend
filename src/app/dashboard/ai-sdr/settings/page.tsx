"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AISDRSettings {
  id?: string;
  user_id: string;
  enabled: boolean;
  require_manual_approval: boolean;
  daily_send_limit: number;
}

interface UserSettings {
  email_tone?: "professional" | "casual" | "warm" | "direct";
  default_signoff?: string;
  company_name?: string;
  role_title?: string;
  website_url?: string;
}

export default function AISDRSettingsPage() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AISDRSettings | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings>({});
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        setUserId(user.id);

        // Fetch existing settings
        const { data, error } = await supabase
          .from("ai_sdr_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          console.error("Error loading settings:", error);
        }

        if (data) {
          setSettings(data);
        } else {
          // Create default settings if none exist
          const defaultSettings: AISDRSettings = {
            user_id: user.id,
            enabled: true,
            require_manual_approval: false,
            daily_send_limit: 50,
          };
          setSettings(defaultSettings);
        }

        // Load user settings (tone/identity)
        const { data: userSettingsData } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (userSettingsData) {
          setUserSettings({
            email_tone: userSettingsData.email_tone || "professional",
            default_signoff: userSettingsData.default_signoff || "",
            company_name: userSettingsData.company_name || "",
            role_title: userSettingsData.role_title || "",
            website_url: userSettingsData.website_url || "",
          });
        }
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [supabase]);

  const handleSave = async () => {
    if (!settings || !userId) return;

    setSaving(true);
    try {
      if (settings.id) {
        // Update existing
        const { error } = await supabase
          .from("ai_sdr_settings")
          .update({
            enabled: settings.enabled,
            require_manual_approval: settings.require_manual_approval,
            daily_send_limit: settings.daily_send_limit,
          })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from("ai_sdr_settings")
          .insert({
            user_id: userId,
            enabled: settings.enabled,
            require_manual_approval: settings.require_manual_approval,
            daily_send_limit: settings.daily_send_limit,
          })
          .select()
          .single();

        if (error) throw error;
        if (data) setSettings(data);
      }

      // Save user settings (tone/identity)
      const { error: userSettingsError } = await supabase
        .from("user_settings")
        .upsert({
          user_id: userId,
          email_tone: userSettings.email_tone || "professional",
          default_signoff: userSettings.default_signoff || null,
          company_name: userSettings.company_name || null,
          role_title: userSettings.role_title || null,
          website_url: userSettings.website_url || null,
        }, {
          onConflict: "user_id",
        });

      if (userSettingsError) throw userSettingsError;

      alert("Settings saved successfully!");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Failed to load settings.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">AI SDR Control Center</h1>
        <p className="text-muted-foreground">
          Control how AI SDR operates across your account. Set global limits and approval requirements.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Global Settings</CardTitle>
          <CardDescription>
            These settings apply to all campaigns unless overridden at the campaign level.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* AI SDR Enabled Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enabled" className="text-base font-medium">
                AI SDR Autopilot Enabled
              </Label>
              <p className="text-sm text-muted-foreground">
                When disabled, AI SDR will not send any emails automatically.
              </p>
            </div>
            <Switch
              id="enabled"
              checked={settings.enabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, enabled: checked })
              }
            />
          </div>

          {/* Manual Approval Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="manual-approval" className="text-base font-medium">
                Require Manual Approval for All AI SDR Sends
              </Label>
              <p className="text-sm text-muted-foreground">
                When enabled, all AI SDR actions will be queued for your review before sending.
              </p>
            </div>
            <Switch
              id="manual-approval"
              checked={settings.require_manual_approval}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, require_manual_approval: checked })
              }
            />
          </div>

          {/* Daily Send Limit */}
          <div className="space-y-2">
            <Label htmlFor="daily-limit" className="text-base font-medium">
              Daily AI SDR Send Limit
            </Label>
            <p className="text-sm text-muted-foreground mb-2">
              Maximum number of AI SDR emails that can be sent per day (safety throttle).
            </p>
            <Input
              id="daily-limit"
              type="number"
              min="1"
              max="1000"
              value={settings.daily_send_limit}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  daily_send_limit: parseInt(e.target.value) || 50,
                })
              }
              className="w-32"
            />
          </div>

          <div className="pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>Global Kill Switch:</strong> When "AI SDR Autopilot Enabled" is off, AI SDR
            will not send any emails, regardless of campaign settings.
          </p>
          <p>
            <strong>Manual Approval:</strong> When enabled, all AI SDR actions go to the review
            queue at <code className="bg-muted px-1 rounded">/dashboard/ai-sdr/review</code> before
            sending.
          </p>
          <p>
            <strong>Daily Limit:</strong> Once the daily limit is reached, AI SDR will stop sending
            emails for the rest of the day. The counter resets at midnight UTC.
          </p>
          <p>
            <strong>Campaign-Level Controls:</strong> Each campaign can override these settings
            with its own AI SDR toggle and mode (autopilot vs review).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tone & Identity Settings</CardTitle>
          <CardDescription>
            Configure how AI SDR represents you in emails. These settings apply to all AI-generated replies and follow-ups.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email_tone" className="text-base font-medium">
              Email Tone
            </Label>
            <p className="text-sm text-muted-foreground mb-2">
              The overall tone style for AI-generated emails.
            </p>
            <Select
              value={userSettings.email_tone || "professional"}
              onValueChange={(value: "professional" | "casual" | "warm" | "direct") =>
                setUserSettings({ ...userSettings, email_tone: value })
              }
            >
              <SelectTrigger id="email_tone" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="direct">Direct</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_name" className="text-base font-medium">
              Company Name
            </Label>
            <Input
              id="company_name"
              value={userSettings.company_name || ""}
              onChange={(e) =>
                setUserSettings({ ...userSettings, company_name: e.target.value })
              }
              placeholder="e.g., SmartSend AI"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role_title" className="text-base font-medium">
              Role Title
            </Label>
            <Input
              id="role_title"
              value={userSettings.role_title || ""}
              onChange={(e) =>
                setUserSettings({ ...userSettings, role_title: e.target.value })
              }
              placeholder="e.g., Founder, SmartSend AI"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website_url" className="text-base font-medium">
              Website URL
            </Label>
            <Input
              id="website_url"
              type="url"
              value={userSettings.website_url || ""}
              onChange={(e) =>
                setUserSettings({ ...userSettings, website_url: e.target.value })
              }
              placeholder="https://smartsend.ai"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="default_signoff" className="text-base font-medium">
              Default Sign-off
            </Label>
            <p className="text-sm text-muted-foreground mb-2">
              Default signature line (e.g., "Best, Julian"). Leave empty to not include automatically.
            </p>
            <Input
              id="default_signoff"
              value={userSettings.default_signoff || ""}
              onChange={(e) =>
                setUserSettings({ ...userSettings, default_signoff: e.target.value })
              }
              placeholder="e.g., Best, Julian"
            />
          </div>

          <div className="pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

