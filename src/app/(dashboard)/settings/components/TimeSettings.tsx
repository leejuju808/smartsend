"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Clock } from "lucide-react";

interface TimeSettingsProps {
  canEdit: boolean;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export default function TimeSettings({ canEdit }: TimeSettingsProps) {
  const [timezone, setTimezone] = useState("America/New_York");
  const [businessHoursStart, setBusinessHoursStart] = useState("09:00");
  const [businessHoursEnd, setBusinessHoursEnd] = useState("17:00");
  const [weekendsEnabled, setWeekendsEnabled] = useState(true);
  const [stormExceptions, setStormExceptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings/time");
      const data = await res.json();
      
      if (data.settings?.time) {
        const time = data.settings.time;
        setTimezone(time.timezone || "America/New_York");
        setBusinessHoursStart(time.business_hours_start?.substring(0, 5) || "09:00");
        setBusinessHoursEnd(time.business_hours_end?.substring(0, 5) || "17:00");
        setWeekendsEnabled(time.weekends_enabled !== false);
        setStormExceptions(time.storm_emergency_exceptions || []);
      }
    } catch (error) {
      console.error("Failed to load time settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          time: {
            timezone,
            business_hours_start: `${businessHoursStart}:00`,
            business_hours_end: `${businessHoursEnd}:00`,
            weekends_enabled: weekendsEnabled,
            storm_emergency_exceptions: stormExceptions,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Time settings updated!");
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
        <h1 className="text-2xl font-semibold mb-2">Time Settings</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Time Settings</h1>
        <p className="text-sm text-gray-600">
          Critical time controls: timezone, business hours, blackout times, storm exceptions
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Timezone <span className="text-red-500">*</span>
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace("_", " ")}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Affects scheduler availability, campaign send windows, auto-follow-ups, and reminders
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Business Hours Start
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
              Business Hours End
            </label>
            <Input
              type="time"
              value={businessHoursEnd}
              onChange={(e) => setBusinessHoursEnd(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={weekendsEnabled}
            onChange={(e) => setWeekendsEnabled(e.target.checked)}
            disabled={!canEdit}
            className="rounded"
          />
          <label className="text-sm text-gray-700">Enable weekends</label>
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
    </div>
  );
}





















































