"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Calendar } from "lucide-react";

interface SchedulerRulesSettingsProps {
  canEdit: boolean;
}

export default function SchedulerRulesSettings({ canEdit }: SchedulerRulesSettingsProps) {
  const [inspectionDuration, setInspectionDuration] = useState(60);
  const [travelMultiplier, setTravelMultiplier] = useState(1.5);
  const [bufferMinutes, setBufferMinutes] = useState(15);
  const [maxDailyAppointments, setMaxDailyAppointments] = useState(8);
  const [weatherBlockEnabled, setWeatherBlockEnabled] = useState(true);
  const [homeownerPreformEnabled, setHomeownerPreformEnabled] = useState(true);
  const [smsRemindersEnabled, setSmsRemindersEnabled] = useState(true);
  const [prepChecklistEnabled, setPrepChecklistEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings/scheduler-rules");
      const data = await res.json();
      
      if (data.settings?.schedulerRules) {
        const rules = data.settings.schedulerRules;
        setInspectionDuration(rules.default_inspection_duration_minutes || 60);
        setTravelMultiplier(rules.travel_time_multiplier || 1.5);
        setBufferMinutes(rules.buffer_between_appointments_minutes || 15);
        setMaxDailyAppointments(rules.max_daily_appointments || 8);
        setWeatherBlockEnabled(rules.weather_block_enabled !== false);
        setHomeownerPreformEnabled(rules.homeowner_preform_enabled !== false);
        setSmsRemindersEnabled(rules.sms_reminders_enabled !== false);
        setPrepChecklistEnabled(rules.prep_checklist_enabled !== false);
      }
    } catch (error) {
      console.error("Failed to load scheduler rules:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/scheduler-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedulerRules: {
            default_inspection_duration_minutes: inspectionDuration,
            travel_time_multiplier: travelMultiplier,
            buffer_between_appointments_minutes: bufferMinutes,
            max_daily_appointments: maxDailyAppointments,
            weather_block_enabled: weatherBlockEnabled,
            homeowner_preform_enabled: homeownerPreformEnabled,
            sms_reminders_enabled: smsRemindersEnabled,
            prep_checklist_enabled: prepChecklistEnabled,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Scheduler rules updated!");
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
        <h1 className="text-2xl font-semibold mb-2">Scheduler Rules</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Scheduler Rules</h1>
        <p className="text-sm text-gray-600">
          Scheduler configuration: inspection duration, travel time, buffers, weather blocks
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Inspection Duration (minutes)
            </label>
            <Input
              type="number"
              value={inspectionDuration}
              onChange={(e) => setInspectionDuration(parseInt(e.target.value) || 60)}
              disabled={!canEdit}
              min={15}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Travel Time Multiplier
            </label>
            <Input
              type="number"
              step="0.1"
              value={travelMultiplier}
              onChange={(e) => setTravelMultiplier(parseFloat(e.target.value) || 1.5)}
              disabled={!canEdit}
              min={1}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Buffer Between Appointments (minutes)
            </label>
            <Input
              type="number"
              value={bufferMinutes}
              onChange={(e) => setBufferMinutes(parseInt(e.target.value) || 15)}
              disabled={!canEdit}
              min={0}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Daily Appointments
            </label>
            <Input
              type="number"
              value={maxDailyAppointments}
              onChange={(e) => setMaxDailyAppointments(parseInt(e.target.value) || 8)}
              disabled={!canEdit}
              min={1}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={weatherBlockEnabled}
              onChange={(e) => setWeatherBlockEnabled(e.target.checked)}
              disabled={!canEdit}
              className="rounded"
            />
            <label className="text-sm text-gray-700">Enable weather-block logic</label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={homeownerPreformEnabled}
              onChange={(e) => setHomeownerPreformEnabled(e.target.checked)}
              disabled={!canEdit}
              className="rounded"
            />
            <label className="text-sm text-gray-700">Enable homeowner pre-form</label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={smsRemindersEnabled}
              onChange={(e) => setSmsRemindersEnabled(e.target.checked)}
              disabled={!canEdit}
              className="rounded"
            />
            <label className="text-sm text-gray-700">Enable SMS reminders</label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={prepChecklistEnabled}
              onChange={(e) => setPrepChecklistEnabled(e.target.checked)}
              disabled={!canEdit}
              className="rounded"
            />
            <label className="text-sm text-gray-700">Enable prep checklist</label>
          </div>
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





















































