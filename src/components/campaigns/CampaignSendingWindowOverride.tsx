"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface CampaignSendingWindowOverrideProps {
  campaignId: string;
  canEdit?: boolean;
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

export function CampaignSendingWindowOverride({ 
  campaignId, 
  canEdit = true 
}: CampaignSendingWindowOverrideProps) {
  const [enabled, setEnabled] = useState(false);
  const [timezone, setTimezone] = useState('America/Los_Angeles');
  const [allowedDays, setAllowedDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('16:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [campaignId]);

  const loadSettings = async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/sending-window`);
      if (!res.ok) throw new Error("Failed to load settings");
      
      const data = await res.json();
      const window = data.custom_sending_window;
      
      if (window && window.enabled) {
        setEnabled(true);
        if (window.allowed_days) setAllowedDays(window.allowed_days);
        if (window.start_time) setStartTime(window.start_time);
        if (window.end_time) setEndTime(window.end_time);
        if (window.timezone) setTimezone(window.timezone);
      }
    } catch (error) {
      console.error("Failed to load campaign sending window:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/sending-window`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          allowed_days: enabled ? allowedDays : undefined,
          start_time: enabled ? startTime : undefined,
          end_time: enabled ? endTime : undefined,
          timezone: enabled ? timezone : undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Save failed");
      }

      toast.success("Campaign sending window updated!");
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!canEdit) return;
    setEnabled(false);
    setAllowedDays(['mon', 'tue', 'wed', 'thu', 'fri']);
    setStartTime('09:00');
    setEndTime('16:00');
    setTimezone('America/Los_Angeles');
    await handleSave();
  };

  const toggleDay = (day: string) => {
    if (!canEdit || !enabled) return;
    setAllowedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  if (loading) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Sending Window Override</h3>
          <p className="text-sm text-muted-foreground">
            Override workspace sending window for this campaign
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={!canEdit}
          />
          <Label>Enable Override</Label>
        </div>
      </div>

      {enabled && (
        <>
          {/* Timezone */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
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
            <Label className="text-sm font-medium mb-3 block">
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
              <Label className="text-sm font-medium mb-2 block">
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
              <Label className="text-sm font-medium mb-2 block">
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
        </>
      )}

      {!enabled && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-600">
            This campaign will use the workspace default sending window. Enable override to set custom hours/days.
          </p>
        </div>
      )}

      {/* Actions */}
      {canEdit && (
        <div className="flex justify-between pt-4 border-t">
          {enabled && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={saving}
            >
              Reset to Workspace Default
            </Button>
          )}
          <div className="ml-auto">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}



