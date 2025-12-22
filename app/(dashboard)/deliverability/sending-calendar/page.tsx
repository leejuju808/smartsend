"use client";

import { useState, useEffect } from "react";
import { Calendar, Clock, Globe, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";

interface TimeWindow {
  start: string;
  end: string;
}

interface SendingCalendar {
  workspace_id: string;
  allowed_days: number[];
  allowed_time_windows: TimeWindow[];
  timezone: string;
  pacing_enabled: boolean;
  pacing_strategy: string;
  region_based_timing_enabled: boolean;
}

interface GlobalRules {
  workspace_id: string;
  max_sends_per_minute: number | null;
  max_sends_per_hour: number | null;
  max_sends_per_inbox_per_hour: number | null;
  auto_slowdown_bounce_threshold: number;
  auto_pause_spam_threshold: number;
}

interface Holiday {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  holiday_type: string;
  auto_block_enabled: boolean;
}

interface Activity {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
  metadata: any;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function SendingCalendarPage() {
  const [calendar, setCalendar] = useState<SendingCalendar | null>(null);
  const [rules, setRules] = useState<GlobalRules | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [view, setView] = useState<"daily" | "weekly" | "inbox" | "global">("daily");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      
      // Load calendar settings
      const calendarRes = await fetch("/api/v1/sending-calendar");
      const calendarData = await calendarRes.json();
      
      setCalendar(calendarData.calendar);
      setRules(calendarData.rules);
      setHolidays(calendarData.holidays || []);
      
      // Load activity log
      const activityRes = await fetch("/api/v1/sending-calendar/activity?limit=50");
      const activityData = await activityRes.json();
      setActivities(activityData.activities || []);
      
      // Load advisor alerts
      const alertsRes = await fetch("/api/v1/sending-calendar/advisor-alerts");
      const alertsData = await alertsRes.json();
      setAlerts(alertsData.alerts || []);
    } catch (error) {
      console.error("Error loading sending calendar:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveCalendar() {
    setSaving(true);
    try {
      await fetch("/api/v1/sending-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendar,
          rules
        })
      });
      alert("✅ Settings saved successfully!");
      await loadData();
    } catch (error) {
      console.error("Error saving calendar:", error);
      alert("❌ Error saving settings");
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(day: number) {
    if (!calendar) return;
    
    const currentDays = calendar.allowed_days || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort();
    
    setCalendar({ ...calendar, allowed_days: newDays });
  }

  function addTimeWindow() {
    if (!calendar) return;
    
    const newWindows = [...(calendar.allowed_time_windows || []), { start: "09:00", end: "17:00" }];
    setCalendar({ ...calendar, allowed_time_windows: newWindows });
  }

  function updateTimeWindow(index: number, field: "start" | "end", value: string) {
    if (!calendar) return;
    
    const newWindows = [...calendar.allowed_time_windows];
    newWindows[index] = { ...newWindows[index], [field]: value };
    setCalendar({ ...calendar, allowed_time_windows: newWindows });
  }

  function removeTimeWindow(index: number) {
    if (!calendar) return;
    
    const newWindows = calendar.allowed_time_windows.filter((_, i) => i !== index);
    setCalendar({ ...calendar, allowed_time_windows: newWindows });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Loading sending calendar...</p>
        </div>
      </div>
    );
  }

  const defaultCalendar: SendingCalendar = {
    workspace_id: "",
    allowed_days: [1, 2, 3, 4, 5],
    allowed_time_windows: [{ start: "09:00", end: "17:00" }],
    timezone: "America/Los_Angeles",
    pacing_enabled: true,
    pacing_strategy: "even",
    region_based_timing_enabled: true
  };

  const currentCalendar = calendar || defaultCalendar;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sending Calendar</h1>
          <p className="text-gray-600 mt-1">
            Control when SmartSend sends emails at the workspace level
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={view}
            onChange={(e) => setView(e.target.value as any)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="daily">Daily View</option>
            <option value="weekly">Weekly View</option>
            <option value="inbox">Inbox View</option>
            <option value="global">Global View</option>
          </select>
          <Button onClick={saveCalendar} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* AI Advisor Alerts */}
      {alerts.length > 0 && (
        <Card className="p-4 bg-yellow-50 border-yellow-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900 mb-2">AI Advisor Alerts</h3>
              {alerts.map((alert, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  <p className="text-sm text-yellow-800">
                    <strong>{alert.title}:</strong> {alert.message}
                  </p>
                  {alert.suggestion && (
                    <p className="text-xs text-yellow-700 mt-1">💡 {alert.suggestion}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Calendar Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Allowed Days */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Allowed Sending Days
            </h2>
            <div className="grid grid-cols-7 gap-2">
              {DAY_NAMES.map((day, index) => {
                const dayNum = index + 1;
                const isAllowed = currentCalendar.allowed_days.includes(dayNum);
                return (
                  <button
                    key={day}
                    onClick={() => toggleDay(dayNum)}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      isAllowed
                        ? "bg-blue-50 border-blue-500 text-blue-700"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    <div className="text-xs font-medium">{day.slice(0, 3)}</div>
                    {isAllowed && <CheckCircle2 className="w-4 h-4 mx-auto mt-1" />}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Time Windows */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Allowed Time Windows
              </h2>
              <Button onClick={addTimeWindow} variant="outline" size="sm">
                + Add Window
              </Button>
            </div>
            <div className="space-y-3">
              {currentCalendar.allowed_time_windows.map((window, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="time"
                    value={window.start}
                    onChange={(e) => updateTimeWindow(index, "start", e.target.value)}
                    className="px-3 py-2 border rounded"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="time"
                    value={window.end}
                    onChange={(e) => updateTimeWindow(index, "end", e.target.value)}
                    className="px-3 py-2 border rounded"
                  />
                  {currentCalendar.allowed_time_windows.length > 1 && (
                    <Button
                      onClick={() => removeTimeWindow(index)}
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timezone
              </label>
              <select
                value={currentCalendar.timezone}
                onChange={(e) => setCalendar({ ...currentCalendar, timezone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="America/Chicago">America/Chicago (CST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Europe/Paris">Europe/Paris (CET)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              </select>
            </div>
          </Card>

          {/* Global Throttle Rules */}
          {rules && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Global Throttle Rules</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Sends per Minute
                  </label>
                  <input
                    type="number"
                    value={rules.max_sends_per_minute || ""}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        max_sends_per_minute: e.target.value ? parseInt(e.target.value) : null
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="No limit"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Sends per Hour
                  </label>
                  <input
                    type="number"
                    value={rules.max_sends_per_hour || ""}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        max_sends_per_hour: e.target.value ? parseInt(e.target.value) : null
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="No limit"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Sends per Inbox per Hour
                  </label>
                  <input
                    type="number"
                    value={rules.max_sends_per_inbox_per_hour || ""}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        max_sends_per_inbox_per_hour: e.target.value
                          ? parseInt(e.target.value)
                          : null
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="No limit"
                  />
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Holidays */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Holiday Blocking</h2>
            <div className="space-y-2">
              {holidays
                .filter((h) => h.auto_block_enabled)
                .slice(0, 5)
                .map((holiday) => (
                  <div
                    key={holiday.id}
                    className="p-2 bg-red-50 border border-red-200 rounded text-sm"
                  >
                    <div className="font-medium text-red-900">{holiday.name}</div>
                    <div className="text-red-700 text-xs">
                      {new Date(holiday.start_date).toLocaleDateString()}
                      {holiday.end_date !== holiday.start_date &&
                        ` - ${new Date(holiday.end_date).toLocaleDateString()}`}
                    </div>
                  </div>
                ))}
            </div>
          </Card>

          {/* Recent Activity */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {activities.slice(0, 10).map((activity) => (
                <div key={activity.id} className="text-sm border-b pb-2 last:border-0">
                  <div className="font-medium text-gray-900">{activity.description}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(activity.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}



