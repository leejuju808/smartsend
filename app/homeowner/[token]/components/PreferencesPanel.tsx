"use client";

// Block 94000 — Homeowner Preferences Panel
// Let homeowners customize how they receive updates

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Check } from "lucide-react";
import { toast } from "sonner";

type Preferences = {
  id?: string;
  prefers_sms: boolean;
  prefers_email: boolean;
  update_frequency: "minimal" | "normal" | "detailed" | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

interface PreferencesPanelProps {
  portalToken: string;
  jobId: string;
  initialPreferences?: Preferences | null;
}

export function PreferencesPanel({
  portalToken,
  jobId,
  initialPreferences,
}: PreferencesPanelProps) {
  const [preferences, setPreferences] = useState<Preferences>({
    prefers_sms: initialPreferences?.prefers_sms ?? true,
    prefers_email: initialPreferences?.prefers_email ?? true,
    update_frequency: initialPreferences?.update_frequency ?? "normal",
    quiet_hours_start: initialPreferences?.quiet_hours_start ?? null,
    quiet_hours_end: initialPreferences?.quiet_hours_end ?? null,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/homeowner/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          portal_token: portalToken,
          job_id: jobId,
          ...preferences,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save preferences");
      }

      toast.success("Preferences saved successfully");
    } catch (error: any) {
      console.error("Error saving preferences:", error);
      toast.error("Failed to save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Communication Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Channel Preferences */}
        <div className="space-y-4">
          <Label className="text-base font-semibold">How do you like to get updates?</Label>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="sms-toggle" className="text-sm font-medium">
                  SMS / Text Messages
                </Label>
                <p className="text-xs text-gray-500">Receive updates via text message</p>
              </div>
              <Switch
                id="sms-toggle"
                checked={preferences.prefers_sms}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, prefers_sms: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email-toggle" className="text-sm font-medium">
                  Email
                </Label>
                <p className="text-xs text-gray-500">Receive updates via email</p>
              </div>
              <Switch
                id="email-toggle"
                checked={preferences.prefers_email}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, prefers_email: checked })
                }
              />
            </div>
          </div>
        </div>

        {/* Update Frequency */}
        <div className="space-y-2">
          <Label htmlFor="frequency-select" className="text-base font-semibold">
            Update Frequency
          </Label>
          <Select
            value={preferences.update_frequency || "normal"}
            onValueChange={(value: "minimal" | "normal" | "detailed") =>
              setPreferences({ ...preferences, update_frequency: value })
            }
          >
            <SelectTrigger id="frequency-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minimal">Minimal Updates</SelectItem>
              <SelectItem value="normal">Normal Updates</SelectItem>
              <SelectItem value="detailed">More Updates</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">
            {preferences.update_frequency === "minimal" &&
              "Only important updates (scheduling, completion, etc.)"}
            {preferences.update_frequency === "normal" &&
              "Regular updates at key milestones"}
            {preferences.update_frequency === "detailed" &&
              "Frequent updates including progress photos and status changes"}
          </p>
        </div>

        {/* Quiet Hours */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">Quiet Hours (Optional)</Label>
          <p className="text-xs text-gray-500">
            We won't send notifications during these hours
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quiet-start" className="text-sm">
                Start Time
              </Label>
              <input
                id="quiet-start"
                type="time"
                value={preferences.quiet_hours_start || ""}
                onChange={(e) =>
                  setPreferences({ ...preferences, quiet_hours_start: e.target.value || null })
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="quiet-end" className="text-sm">
                End Time
              </Label>
              <input
                id="quiet-end"
                type="time"
                value={preferences.quiet_hours_end || ""}
                onChange={(e) =>
                  setPreferences({ ...preferences, quiet_hours_end: e.target.value || null })
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Saving..." : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Save Preferences
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
