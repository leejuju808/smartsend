"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import ReplyAutomationSettings from "./ReplyAutomationSettings";

interface SendingSettingsProps {
  canEdit: boolean;
}

export default function SendingSettings({ canEdit }: SendingSettingsProps) {
  const [respectLocalTimezones, setRespectLocalTimezones] = useState(true);
  const [businessHoursStart, setBusinessHoursStart] = useState("09:00");
  const [businessHoursEnd, setBusinessHoursEnd] = useState("17:00");
  const [avoidWeekends, setAvoidWeekends] = useState(true);
  const [maxDailySends, setMaxDailySends] = useState(300);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      
      if (data.settings?.sending) {
        setRespectLocalTimezones(data.settings.sending.respect_local_timezones ?? true);
        setBusinessHoursStart(data.settings.sending.business_hours?.start || "09:00");
        setBusinessHoursEnd(data.settings.sending.business_hours?.end || "17:00");
        setAvoidWeekends(data.settings.sending.avoid_weekends ?? true);
        setMaxDailySends(data.settings.sending.max_daily_sends || 300);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/sending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sending: {
            respect_local_timezones: respectLocalTimezones,
            business_hours: {
              start: businessHoursStart,
              end: businessHoursEnd,
            },
            avoid_weekends: avoidWeekends,
            max_daily_sends: maxDailySends,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Settings saved!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Sending Settings</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Sending Settings</h1>
        <p className="text-sm text-gray-600">
          Configure when emails are sent and daily sending limits
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-4">Lead-Level Timezones</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={respectLocalTimezones}
                onChange={() => setRespectLocalTimezones(true)}
                disabled={!canEdit}
                className="rounded"
              />
              <span className="text-sm">Respect local timezone</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={!respectLocalTimezones}
                onChange={() => setRespectLocalTimezones(false)}
                disabled={!canEdit}
                className="rounded"
              />
              <span className="text-sm">Ignore (use workspace timezone)</span>
            </label>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-4">Default Per-Lead Window</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start
              </label>
              <Input
                type="time"
                value={businessHoursStart}
                onChange={(e) => setBusinessHoursStart(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End
              </label>
              <Input
                type="time"
                value={businessHoursEnd}
                onChange={(e) => setBusinessHoursEnd(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={avoidWeekends}
              onChange={(e) => setAvoidWeekends(e.target.checked)}
              disabled={!canEdit}
              className="rounded"
            />
            <span className="text-sm">Avoid weekends</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Daily Sends per Workspace
          </label>
          <Input
            type="number"
            value={maxDailySends}
            onChange={(e) => setMaxDailySends(parseInt(e.target.value) || 0)}
            min={1}
            disabled={!canEdit}
          />
        </div>

        {canEdit && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}

        {message && (
          <div
            className={`p-3 rounded-lg ${
              message.startsWith("Error")
                ? "bg-red-50 text-red-700"
                : "bg-green-50 text-green-700"
            }`}
          >
            {message}
          </div>
        )}
      </div>

      <ReplyAutomationSettings canEdit={canEdit} />
    </div>
  );
}


