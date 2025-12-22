"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, Save, Clock } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const WEEKDAYS = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
];

const COMMON_TIMEZONES = [
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

interface Availability {
  id?: string;
  user_id: string;
  active_weekdays: string[];
  day_start: string;
  day_end: string;
  slot_duration_min: number;
  timezone: string;
}

export default function AvailabilitySettingsPage() {
  const [availability, setAvailability] = useState<Availability>({
    user_id: "",
    active_weekdays: ["mon", "tue", "wed", "thu", "fri"],
    day_start: "09:00",
    day_end: "17:00",
    slot_duration_min: 30,
    timezone: "America/Los_Angeles",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchAvailability();
  }, []);

  const fetchAvailability = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("meeting_availability")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) {
        setAvailability({
          ...data,
          day_start: data.day_start || "09:00",
          day_end: data.day_end || "17:00",
        });
      } else {
        // Set default with user_id
        setAvailability({
          user_id: user.id,
          active_weekdays: ["mon", "tue", "wed", "thu", "fri"],
          day_start: "09:00",
          day_end: "17:00",
          slot_duration_min: 30,
          timezone: "America/Los_Angeles",
        });
      }
    } catch (err) {
      console.error("Error fetching availability:", err);
      toast.error("Failed to load availability settings");
    } finally {
      setLoading(false);
    }
  };

  const handleWeekdayToggle = (weekday: string) => {
    setAvailability((prev) => {
      const current = prev.active_weekdays || [];
      const newWeekdays = current.includes(weekday)
        ? current.filter((d) => d !== weekday)
        : [...current, weekday];
      return { ...prev, active_weekdays: newWeekdays };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      const payload = {
        ...availability,
        user_id: user.id,
      };

      const { error } = await supabase
        .from("meeting_availability")
        .upsert(payload, {
          onConflict: "user_id",
        });

      if (error) throw error;

      toast.success("Availability settings saved!");
    } catch (err) {
      console.error("Error saving availability:", err);
      toast.error("Failed to save availability settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Link
          href="/dashboard/meetings"
          className="p-2 hover:bg-gray-100 rounded-md transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Meeting Availability</h1>
          <p className="text-gray-600 mt-1">
            Configure when you're available for meetings. SmartSend will automatically book slots based on these settings.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        {/* Weekdays */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Available Days
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {WEEKDAYS.map((day) => {
              const isActive = availability.active_weekdays?.includes(day.value);
              return (
                <div
                  key={day.value}
                  className="flex items-center space-x-2 p-3 border rounded-md hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleWeekdayToggle(day.value)}
                >
                  <Switch
                    checked={isActive}
                    onCheckedChange={() => handleWeekdayToggle(day.value)}
                  />
                  <span className="text-sm font-medium">{day.label}</span>
                </div>
              );
            })}
          </div>
          {(!availability.active_weekdays || availability.active_weekdays.length === 0) && (
            <p className="text-sm text-red-600 mt-2">
              Please select at least one day
            </p>
          )}
        </div>

        {/* Time Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Day Start Time
            </label>
            <Input
              type="time"
              value={availability.day_start}
              onChange={(e) =>
                setAvailability({ ...availability, day_start: e.target.value })
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Day End Time
            </label>
            <Input
              type="time"
              value={availability.day_end}
              onChange={(e) =>
                setAvailability({ ...availability, day_end: e.target.value })
              }
              className="w-full"
            />
          </div>
        </div>

        {/* Slot Duration */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Meeting Duration (minutes)
          </label>
          <div className="flex items-center space-x-4">
            <Input
              type="number"
              min="15"
              max="120"
              step="15"
              value={availability.slot_duration_min}
              onChange={(e) =>
                setAvailability({
                  ...availability,
                  slot_duration_min: parseInt(e.target.value) || 30,
                })
              }
              className="w-32"
            />
            <span className="text-sm text-gray-500">
              Common: 15, 30, 45, 60 minutes
            </span>
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Timezone
          </label>
          <select
            value={availability.timezone}
            onChange={(e) =>
              setAvailability({ ...availability, timezone: e.target.value })
            }
            className="w-full h-10 rounded-2xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-gray-500 mt-2">
            All times above are in your local timezone
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={saving || !availability.active_weekdays || availability.active_weekdays.length === 0}
            className="flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? "Saving..." : "Save Availability"}</span>
          </Button>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How it works</p>
            <p>
              When a lead expresses intent to meet (e.g., "let's hop on a call"), SmartSend will:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Detect meeting intent from their email</li>
              <li>Find the next available slot based on your settings</li>
              <li>Create a calendar event on your Google Calendar</li>
              <li>Send a confirmation email to the lead</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}


