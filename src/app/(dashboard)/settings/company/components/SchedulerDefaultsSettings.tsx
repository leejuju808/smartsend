"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface SchedulerDefaultsSettingsProps {
  canEdit: boolean;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function SchedulerDefaultsSettings({ canEdit }: SchedulerDefaultsSettingsProps) {
  const [businessHours, setBusinessHours] = useState<Record<string, { start: string; end: string; enabled: boolean }>>({
    monday: { start: "09:00", end: "17:00", enabled: true },
    tuesday: { start: "09:00", end: "17:00", enabled: true },
    wednesday: { start: "09:00", end: "17:00", enabled: true },
    thursday: { start: "09:00", end: "17:00", enabled: true },
    friday: { start: "09:00", end: "17:00", enabled: true },
    saturday: { start: "09:00", end: "13:00", enabled: false },
    sunday: { start: "09:00", end: "13:00", enabled: false },
  });
  const [defaultDuration, setDefaultDuration] = useState(30);
  const [maxAppointments, setMaxAppointments] = useState(10);
  const [blockedDays, setBlockedDays] = useState<string[]>([]);
  const [defaultAppointmentType, setDefaultAppointmentType] = useState("estimate");
  const [bookingAssignmentRule, setBookingAssignmentRule] = useState("manual");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/company/settings");
      const data = await res.json();

      if (data.scheduler) {
        if (data.scheduler.business_hours) {
          setBusinessHours(data.scheduler.business_hours);
        }
        setDefaultDuration(data.scheduler.default_appointment_duration_minutes || 30);
        setMaxAppointments(data.scheduler.max_appointments_per_day || 10);
        setBlockedDays(data.scheduler.blocked_days || []);
        setDefaultAppointmentType(data.scheduler.default_appointment_type || "estimate");
        setBookingAssignmentRule(data.scheduler.booking_assignment_rule || "manual");
      }
    } catch (error) {
      console.error("Failed to load scheduler settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/company/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "scheduler",
          data: {
            business_hours: businessHours,
            default_appointment_duration_minutes: defaultDuration,
            max_appointments_per_day: maxAppointments,
            blocked_days: blockedDays,
            default_appointment_type: defaultAppointmentType,
            booking_assignment_rule: bookingAssignmentRule,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Scheduler defaults saved!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const updateDayHours = (day: string, field: "start" | "end" | "enabled", value: string | boolean) => {
    setBusinessHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Scheduler Defaults</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Scheduler Defaults</h1>
        <p className="text-sm text-gray-600">
          Configure default business hours, appointment types, and booking assignment rules
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-4">Business Hours</h3>
          <div className="space-y-3">
            {DAYS.map((day) => (
              <div key={day} className="flex items-center gap-4">
                <div className="w-24">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={businessHours[day].enabled}
                      onChange={(e) => updateDayHours(day, "enabled", e.target.checked)}
                      disabled={!canEdit}
                      className="rounded"
                    />
                    <span className="text-sm font-medium capitalize">{day}</span>
                  </label>
                </div>
                {businessHours[day].enabled && (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="time"
                      value={businessHours[day].start}
                      onChange={(e) => updateDayHours(day, "start", e.target.value)}
                      disabled={!canEdit}
                      className="w-32"
                    />
                    <span className="text-gray-500">to</span>
                    <Input
                      type="time"
                      value={businessHours[day].end}
                      onChange={(e) => updateDayHours(day, "end", e.target.value)}
                      disabled={!canEdit}
                      className="w-32"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Appointment Duration (minutes)
            </label>
            <Input
              type="number"
              value={defaultDuration}
              onChange={(e) => setDefaultDuration(parseInt(e.target.value) || 0)}
              disabled={!canEdit}
              className="w-full"
              min="15"
              max="480"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Appointments Per Day
            </label>
            <Input
              type="number"
              value={maxAppointments}
              onChange={(e) => setMaxAppointments(parseInt(e.target.value) || 0)}
              disabled={!canEdit}
              className="w-full"
              min="1"
              max="100"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default Appointment Type
          </label>
          <select
            value={defaultAppointmentType}
            onChange={(e) => setDefaultAppointmentType(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          >
            <option value="estimate">Estimate</option>
            <option value="inspection">Inspection</option>
            <option value="repair">Repair</option>
            <option value="consultation">Consultation</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Lead Assignment Rule for Bookings
          </label>
          <select
            value={bookingAssignmentRule}
            onChange={(e) => setBookingAssignmentRule(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          >
            <option value="manual">Manual Assignment</option>
            <option value="round_robin">Round-Robin</option>
            <option value="by_pipeline_stage">Based on Pipeline Stage</option>
            <option value="by_region">Based on Region/Zip</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Who gets assigned when a lead books an appointment
          </p>
        </div>

        {message && (
          <div
            className={`p-3 rounded-md ${
              message.startsWith("Error")
                ? "bg-red-50 text-red-800"
                : "bg-green-50 text-green-800"
            }`}
          >
            {message}
          </div>
        )}

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}





















































