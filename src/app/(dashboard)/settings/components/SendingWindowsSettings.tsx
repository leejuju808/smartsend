"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface SendingWindowsSettingsProps {
  canEdit: boolean;
}

const DAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'UTC',
];

const PRESETS = {
  b2b: {
    name: 'B2B (Mon–Fri, 8am–5pm)',
    allowed_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    start_time: '08:00',
    end_time: '17:00',
  },
  conservative: {
    name: 'Conservative (Mon–Thu, 9am–3pm)',
    allowed_days: ['mon', 'tue', 'wed', 'thu'],
    start_time: '09:00',
    end_time: '15:00',
  },
  aggressive: {
    name: 'Aggressive (Mon–Fri, 8am–8pm, Sat 10am–2pm)',
    allowed_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    start_time: '08:00',
    end_time: '20:00',
  },
};

export default function SendingWindowsSettings({ canEdit }: SendingWindowsSettingsProps) {
  const [timezone, setTimezone] = useState('America/Los_Angeles');
  const [allowedDays, setAllowedDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings/sending-windows");
      if (!res.ok) throw new Error("Failed to load settings");
      
      const data = await res.json();
      if (data.timezone) setTimezone(data.timezone);
      if (data.allowed_days) setAllowedDays(data.allowed_days);
      if (data.start_time) setStartTime(data.start_time);
      if (data.end_time) setEndTime(data.end_time);
    } catch (error) {
      console.error("Failed to load sending window settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    try {
      const res = await fetch("/api/settings/sending-windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone,
          allowed_days: allowedDays,
          start_time: startTime,
          end_time: endTime,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Save failed");
      }

      toast.success("Sending window settings saved!");
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset: typeof PRESETS.b2b) => {
    if (!canEdit) return;
    setAllowedDays(preset.allowed_days);
    setStartTime(preset.start_time);
    setEndTime(preset.end_time);
  };

  const toggleDay = (day: string) => {
    if (!canEdit) return;
    setAllowedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Sending Windows</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Sending Windows</h1>
        <p className="text-sm text-muted-foreground">
          Control when SmartSend is allowed to send emails. This applies globally to all campaigns unless a campaign has its own override.
        </p>
      </div>

      {/* Presets */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Quick Presets</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.values(PRESETS).map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset)}
              disabled={!canEdit}
              className="text-left p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="font-medium text-sm">{preset.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {/* Timezone */}
        <div>
          <Label className="text-sm font-medium text-gray-900 mb-2 block">
            Timezone
          </Label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        {/* Allowed Days */}
        <div>
          <Label className="text-sm font-medium text-gray-900 mb-3 block">
            Allowed Days
          </Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                disabled={!canEdit}
                className={`px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  allowedDays.includes(day.value)
                    ? "bg-blue-500 text-white border-blue-500"
                    : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time Range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium text-gray-900 mb-2 block">
              Start Time
            </Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div>
            <Label className="text-sm font-medium text-gray-900 mb-2 block">
              End Time
            </Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> Warmup emails are excluded from sending window restrictions. This is industry standard.
          </p>
        </div>

        {/* Save Button */}
        {canEdit && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}



