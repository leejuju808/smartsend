"use client";

// Block 19820 — Inbox Settings Center v1
// Full Control Panel for Inbox Configuration

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Settings as SettingsIcon,
  Bell,
  Moon,
  Target,
  Clock,
  CheckSquare,
  Layout,
  Users,
  Sparkles,
  ChevronRight,
  Inbox,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/src/components/ui/slider";
import { createClientComponentClient } from "@/lib/supabase";

const sections = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "quiet-hours", label: "Quiet Hours", icon: Moon },
  { id: "lead-scoring", label: "Lead Scoring", icon: Target },
  { id: "follow-up", label: "Follow-Up Defaults", icon: Clock },
  { id: "tasks", label: "Task Defaults", icon: CheckSquare },
  { id: "layout", label: "Inbox Layout", icon: Layout },
  { id: "team", label: "Team & Permissions", icon: Users },
  { id: "ai", label: "AI Personalization", icon: Sparkles },
];

interface InboxSettings {
  // Notifications
  notify_hot_leads_push?: boolean;
  notify_hot_leads_email?: boolean;
  notify_hot_leads_desktop?: boolean;
  notify_warm_leads_push?: boolean;
  notify_warm_leads_email?: boolean;
  notify_warm_leads_desktop?: boolean;
  notify_task_reminders_push?: boolean;
  notify_task_reminders_email?: boolean;
  notify_task_reminders_desktop?: boolean;
  notify_daily_digest_email?: boolean;
  notify_daily_digest_hour?: number;
  notify_weekly_summary_email?: boolean;
  notify_weekly_summary_day?: number;
  notify_booked_jobs_push?: boolean;
  notify_booked_jobs_email?: boolean;
  notify_booked_jobs_desktop?: boolean;
  notify_activity_feed_push?: boolean;
  notify_activity_feed_email?: boolean;
  notify_activity_feed_desktop?: boolean;
  
  // Quiet Hours
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  quiet_hours_days?: number[];
  quiet_hours_emergency_override?: boolean;
  
  // Lead Scoring Weights
  lead_score_weight_leak_detected?: number;
  lead_score_weight_active_damage?: number;
  lead_score_weight_storm_event?: number;
  lead_score_weight_insurance_claim?: number;
  lead_score_weight_replacement_request?: number;
  lead_score_weight_budget_check?: number;
  lead_score_weight_price_shopper?: number;
  lead_score_weight_urgency?: number;
  lead_score_weight_multiple_messages?: number;
  lead_score_weight_phone_included?: number;
  
  // Follow-Up Defaults
  followup_default_timing_hours?: number;
  followup_auto_reminder_hours?: number;
  followup_warm_lead_sequence_delay_hours?: number;
  followup_no_response_trigger_hours?: number;
  followup_tone?: "aggressive" | "balanced" | "gentle";
  
  // Task Defaults
  task_default_priority?: "low" | "medium" | "high" | "urgent";
  task_default_due_hours?: number;
  task_default_assignee?: "owner" | "rep" | "auto";
  task_auto_mark_in_progress_on_open?: boolean;
  task_auto_close_on_booked?: boolean;
  task_auto_cancel_on_reply?: boolean;
  
  // Layout Preferences
  layout_default_tab?: "all" | "hot" | "warm" | "follow_up" | "booked" | "activity" | "tasks";
  layout_thread_preview_length?: number;
  layout_mode?: "compact" | "comfortable";
  layout_show_lead_score?: boolean;
  layout_show_contact_phone?: boolean;
  layout_show_tags?: boolean;
  layout_show_activity_feed?: boolean;
  layout_show_ai_summary?: boolean;
  
  // AI Personalization
  ai_tone?: "friendly" | "professional" | "direct";
  ai_industry_variant?: "roofing" | "gutters" | "solar" | "siding" | "windows" | "general";
  ai_region_zip?: string;
  ai_insurance_heavy?: boolean;
  ai_retail_heavy?: boolean;
  ai_pricing_guidance_sensitivity?: number;
  
  // Mobile
  mobile_notifications_enabled?: boolean;
  mobile_vibrate_on_hot_lead?: boolean;
  mobile_sound_enabled?: boolean;
}

export default function InboxSettingsPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<string>("notifications");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<InboxSettings>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/inbox/settings");
      if (response.ok) {
        const data = await response.json();
        if (data.settings) {
          setSettings(data.settings);
        }
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/inbox/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setMessage("Settings saved successfully!");
        setTimeout(() => setMessage(null), 3000);
      } else {
        const error = await response.json();
        setMessage(`Error: ${error.error || "Failed to save"}`);
        setTimeout(() => setMessage(null), 5000);
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      setMessage("Failed to save settings. Please try again.");
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof InboxSettings>(
    key: K,
    value: InboxSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Loading inbox settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/settings")}
              className="p-0 h-auto"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
            </Button>
            <Inbox className="h-5 w-5 text-gray-600" />
            <h1 className="text-lg font-semibold text-gray-900">Inbox Settings</h1>
          </div>
          <p className="text-xs text-gray-500">
            Customize your inbox experience
          </p>
          <p className="mt-2 text-[11px] text-gray-400">
            Typical office intake costs $2,500–$4,000/month.
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <li key={section.id}>
                  <button
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="flex-1 text-left">{section.label}</span>
                    {isActive && <ChevronRight className="h-4 w-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full"
          >
            {saving ? "Saving..." : "Save All Settings"}
          </Button>
          {message && (
            <p className={`mt-2 text-xs text-center ${
              message.includes("Error") || message.includes("Failed")
                ? "text-red-600"
                : "text-green-600"
            }`}>
              {message}
            </p>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          {activeSection === "notifications" && (
            <NotificationsSection settings={settings} updateSetting={updateSetting} />
          )}
          {activeSection === "quiet-hours" && (
            <QuietHoursSection settings={settings} updateSetting={updateSetting} />
          )}
          {activeSection === "lead-scoring" && (
            <LeadScoringSection settings={settings} updateSetting={updateSetting} />
          )}
          {activeSection === "follow-up" && (
            <FollowUpSection settings={settings} updateSetting={updateSetting} />
          )}
          {activeSection === "tasks" && (
            <TasksSection settings={settings} updateSetting={updateSetting} />
          )}
          {activeSection === "layout" && (
            <LayoutSection settings={settings} updateSetting={updateSetting} />
          )}
          {activeSection === "team" && (
            <TeamSection settings={settings} updateSetting={updateSetting} />
          )}
          {activeSection === "ai" && (
            <AISection settings={settings} updateSetting={updateSetting} />
          )}
        </div>
      </div>
    </div>
  );
}

// Notification Controls Section
function NotificationsSection({
  settings,
  updateSetting,
}: {
  settings: InboxSettings;
  updateSetting: <K extends keyof InboxSettings>(key: K, value: InboxSettings[K]) => void;
}) {
  const notificationTypes = [
    {
      label: "Hot Lead Alerts",
      push: settings.notify_hot_leads_push ?? true,
      email: settings.notify_hot_leads_email ?? true,
      desktop: settings.notify_hot_leads_desktop ?? true,
      onPushChange: (val: boolean) => updateSetting("notify_hot_leads_push", val),
      onEmailChange: (val: boolean) => updateSetting("notify_hot_leads_email", val),
      onDesktopChange: (val: boolean) => updateSetting("notify_hot_leads_desktop", val),
    },
    {
      label: "Warm Lead Alerts",
      push: settings.notify_warm_leads_push ?? true,
      email: settings.notify_warm_leads_email ?? true,
      desktop: settings.notify_warm_leads_desktop ?? true,
      onPushChange: (val: boolean) => updateSetting("notify_warm_leads_push", val),
      onEmailChange: (val: boolean) => updateSetting("notify_warm_leads_email", val),
      onDesktopChange: (val: boolean) => updateSetting("notify_warm_leads_desktop", val),
    },
    {
      label: "Task Reminders",
      push: settings.notify_task_reminders_push ?? true,
      email: settings.notify_task_reminders_email ?? true,
      desktop: settings.notify_task_reminders_desktop ?? true,
      onPushChange: (val: boolean) => updateSetting("notify_task_reminders_push", val),
      onEmailChange: (val: boolean) => updateSetting("notify_task_reminders_email", val),
      onDesktopChange: (val: boolean) => updateSetting("notify_task_reminders_desktop", val),
    },
    {
      label: "Booked Job Alerts",
      push: settings.notify_booked_jobs_push ?? true,
      email: settings.notify_booked_jobs_email ?? true,
      desktop: settings.notify_booked_jobs_desktop ?? true,
      onPushChange: (val: boolean) => updateSetting("notify_booked_jobs_push", val),
      onEmailChange: (val: boolean) => updateSetting("notify_booked_jobs_email", val),
      onDesktopChange: (val: boolean) => updateSetting("notify_booked_jobs_desktop", val),
    },
    {
      label: "New Activity Feed Items",
      push: settings.notify_activity_feed_push ?? false,
      email: settings.notify_activity_feed_email ?? false,
      desktop: settings.notify_activity_feed_desktop ?? true,
      onPushChange: (val: boolean) => updateSetting("notify_activity_feed_push", val),
      onEmailChange: (val: boolean) => updateSetting("notify_activity_feed_email", val),
      onDesktopChange: (val: boolean) => updateSetting("notify_activity_feed_desktop", val),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Notifications</h2>
        <p className="text-sm text-gray-600">
          Control how and when you receive notifications for inbox activity
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {notificationTypes.map((type) => (
          <div key={type.label} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{type.label}</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-600">Mobile Push</Label>
                <Switch checked={type.push} onCheckedChange={type.onPushChange} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-600">Email</Label>
                <Switch checked={type.email} onCheckedChange={type.onEmailChange} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-600">Desktop</Label>
                <Switch checked={type.desktop} onCheckedChange={type.onDesktopChange} />
              </div>
            </div>
          </div>
        ))}

        {/* Daily Digest */}
        <div className="border-b border-gray-100 pb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Daily Follow-Up Digest</h3>
              <p className="text-xs text-gray-500 mt-1">Summary of follow-ups needed</p>
            </div>
            <Switch
              checked={settings.notify_daily_digest_email ?? true}
              onCheckedChange={(val) => updateSetting("notify_daily_digest_email", val)}
            />
          </div>
          {settings.notify_daily_digest_email && (
            <div className="mt-3">
              <Label className="text-xs text-gray-600 mb-2 block">Send at hour (0-23)</Label>
              <input
                type="number"
                min="0"
                max="23"
                value={settings.notify_daily_digest_hour ?? 7}
                onChange={(e) => updateSetting("notify_daily_digest_hour", parseInt(e.target.value))}
                className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>

        {/* Weekly Summary */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Weekly Pipeline Summary</h3>
              <p className="text-xs text-gray-500 mt-1">Weekly overview of your pipeline</p>
            </div>
            <Switch
              checked={settings.notify_weekly_summary_email ?? true}
              onCheckedChange={(val) => updateSetting("notify_weekly_summary_email", val)}
            />
          </div>
          {settings.notify_weekly_summary_email && (
            <div className="mt-3">
              <Label className="text-xs text-gray-600 mb-2 block">Day of week (0=Sunday, 6=Saturday)</Label>
              <input
                type="number"
                min="0"
                max="6"
                value={settings.notify_weekly_summary_day ?? 1}
                onChange={(e) => updateSetting("notify_weekly_summary_day", parseInt(e.target.value))}
                className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Quiet Hours Section
function QuietHoursSection({
  settings,
  updateSetting,
}: {
  settings: InboxSettings;
  updateSetting: <K extends keyof InboxSettings>(key: K, value: InboxSettings[K]) => void;
}) {
  const days = [
    { label: "Sunday", value: 0 },
    { label: "Monday", value: 1 },
    { label: "Tuesday", value: 2 },
    { label: "Wednesday", value: 3 },
    { label: "Thursday", value: 4 },
    { label: "Friday", value: 5 },
    { label: "Saturday", value: 6 },
  ];

  const selectedDays = settings.quiet_hours_days ?? [0, 1, 2, 3, 4, 5, 6];

  const toggleDay = (day: number) => {
    const newDays = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day];
    updateSetting("quiet_hours_days", newDays);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Quiet Hours</h2>
        <p className="text-sm text-gray-600">
          Set times when notifications are paused to avoid late-night stress
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">
            Quiet Hours Time Range
          </Label>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label className="text-xs text-gray-600 mb-1 block">Start Time</Label>
              <input
                type="time"
                value={settings.quiet_hours_start || ""}
                onChange={(e) => updateSetting("quiet_hours_start", e.target.value || null)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="pt-6 text-gray-400">→</div>
            <div className="flex-1">
              <Label className="text-xs text-gray-600 mb-1 block">End Time</Label>
              <input
                type="time"
                value={settings.quiet_hours_end || ""}
                onChange={(e) => updateSetting("quiet_hours_end", e.target.value || null)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Notifications will queue during these hours and be sent when quiet hours end
          </p>
        </div>

        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">
            Apply Quiet Hours On
          </Label>
          <div className="grid grid-cols-4 gap-2">
            {days.map((day) => (
              <button
                key={day.value}
                onClick={() => toggleDay(day.value)}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  selectedDays.includes(day.value)
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                {day.label.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div>
            <Label className="text-sm font-semibold text-gray-900">Emergency Override</Label>
            <p className="text-xs text-gray-500 mt-1">
              Allow critical notifications during quiet hours
            </p>
          </div>
          <Switch
            checked={settings.quiet_hours_emergency_override ?? false}
            onCheckedChange={(val) => updateSetting("quiet_hours_emergency_override", val)}
          />
        </div>
      </div>
    </div>
  );
}

// Lead Scoring Section
function LeadScoringSection({
  settings,
  updateSetting,
}: {
  settings: InboxSettings;
  updateSetting: <K extends keyof InboxSettings>(key: K, value: InboxSettings[K]) => void;
}) {
  const weights = [
    {
      label: "Leak Detected",
      value: settings.lead_score_weight_leak_detected ?? 5.0,
      onChange: (val: number[]) => updateSetting("lead_score_weight_leak_detected", val[0]),
    },
    {
      label: "Active Damage",
      value: settings.lead_score_weight_active_damage ?? 5.0,
      onChange: (val: number[]) => updateSetting("lead_score_weight_active_damage", val[0]),
    },
    {
      label: "Storm Event",
      value: settings.lead_score_weight_storm_event ?? 4.0,
      onChange: (val: number[]) => updateSetting("lead_score_weight_storm_event", val[0]),
    },
    {
      label: "Insurance Claim",
      value: settings.lead_score_weight_insurance_claim ?? 4.5,
      onChange: (val: number[]) => updateSetting("lead_score_weight_insurance_claim", val[0]),
    },
    {
      label: "Replacement Request",
      value: settings.lead_score_weight_replacement_request ?? 4.0,
      onChange: (val: number[]) => updateSetting("lead_score_weight_replacement_request", val[0]),
    },
    {
      label: "Budget Check",
      value: settings.lead_score_weight_budget_check ?? 3.0,
      onChange: (val: number[]) => updateSetting("lead_score_weight_budget_check", val[0]),
    },
    {
      label: "Price Shopper",
      value: settings.lead_score_weight_price_shopper ?? 2.0,
      onChange: (val: number[]) => updateSetting("lead_score_weight_price_shopper", val[0]),
    },
    {
      label: "Urgency",
      value: settings.lead_score_weight_urgency ?? 4.5,
      onChange: (val: number[]) => updateSetting("lead_score_weight_urgency", val[0]),
    },
    {
      label: "Multiple Messages",
      value: settings.lead_score_weight_multiple_messages ?? 3.5,
      onChange: (val: number[]) => updateSetting("lead_score_weight_multiple_messages", val[0]),
    },
    {
      label: "Phone Number Included",
      value: settings.lead_score_weight_phone_included ?? 3.0,
      onChange: (val: number[]) => updateSetting("lead_score_weight_phone_included", val[0]),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Lead Scoring Weights</h2>
        <p className="text-sm text-gray-600">
          Adjust how AI scores leads by modifying weight factors (0-5 scale)
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {weights.map((weight) => (
          <div key={weight.label} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-gray-900">{weight.label}</Label>
              <span className="text-sm font-semibold text-blue-600">{weight.value.toFixed(1)}</span>
            </div>
            <Slider
              value={[weight.value]}
              onValueChange={weight.onChange}
              min={0}
              max={5}
              step={0.1}
              className="w-full"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Follow-Up Defaults Section
function FollowUpSection({
  settings,
  updateSetting,
}: {
  settings: InboxSettings;
  updateSetting: <K extends keyof InboxSettings>(key: K, value: InboxSettings[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Follow-Up Defaults</h2>
        <p className="text-sm text-gray-600">
          Configure default timing and behavior for follow-up tasks
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">
            Default Follow-Up Timing (hours)
          </Label>
          <input
            type="number"
            min="1"
            max="168"
            value={settings.followup_default_timing_hours ?? 24}
            onChange={(e) => updateSetting("followup_default_timing_hours", parseInt(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500">When to schedule follow-up tasks (1-168 hours)</p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">
            Auto Reminder Timing (hours)
          </Label>
          <input
            type="number"
            min="1"
            max="168"
            value={settings.followup_auto_reminder_hours ?? 48}
            onChange={(e) => updateSetting("followup_auto_reminder_hours", parseInt(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500">When to send reminder notifications</p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">
            Warm Lead Sequence Delay (hours)
          </Label>
          <input
            type="number"
            min="1"
            max="336"
            value={settings.followup_warm_lead_sequence_delay_hours ?? 72}
            onChange={(e) => updateSetting("followup_warm_lead_sequence_delay_hours", parseInt(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500">Delay before starting follow-up sequence for warm leads</p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">
            No Response Trigger (hours)
          </Label>
          <input
            type="number"
            min="1"
            max="336"
            value={settings.followup_no_response_trigger_hours ?? 96}
            onChange={(e) => updateSetting("followup_no_response_trigger_hours", parseInt(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500">When to trigger follow-up for no response</p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">Follow-Up Tone</Label>
          <div className="flex gap-2">
            {(["aggressive", "balanced", "gentle"] as const).map((tone) => (
              <button
                key={tone}
                onClick={() => updateSetting("followup_tone", tone)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  (settings.followup_tone ?? "balanced") === tone
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                {tone.charAt(0).toUpperCase() + tone.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Task Defaults Section
function TasksSection({
  settings,
  updateSetting,
}: {
  settings: InboxSettings;
  updateSetting: <K extends keyof InboxSettings>(key: K, value: InboxSettings[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Task Defaults</h2>
        <p className="text-sm text-gray-600">
          Set default behavior for tasks created from inbox threads
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">Default Priority</Label>
          <div className="flex gap-2">
            {(["low", "medium", "high", "urgent"] as const).map((priority) => (
              <button
                key={priority}
                onClick={() => updateSetting("task_default_priority", priority)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  (settings.task_default_priority ?? "medium") === priority
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                {priority.charAt(0).toUpperCase() + priority.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">Default Due Time (hours)</Label>
          <input
            type="number"
            min="1"
            max="168"
            value={settings.task_default_due_hours ?? 24}
            onChange={(e) => updateSetting("task_default_due_hours", parseInt(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">Default Assignee</Label>
          <div className="flex gap-2">
            {(["owner", "rep", "auto"] as const).map((assignee) => (
              <button
                key={assignee}
                onClick={() => updateSetting("task_default_assignee", assignee)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  (settings.task_default_assignee ?? "auto") === assignee
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                {assignee === "auto" ? "Auto-Assign" : assignee.charAt(0).toUpperCase() + assignee.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-gray-900">Mark In Progress When Thread Opened</Label>
              <p className="text-xs text-gray-500 mt-1">Automatically mark tasks as in progress</p>
            </div>
            <Switch
              checked={settings.task_auto_mark_in_progress_on_open ?? true}
              onCheckedChange={(val) => updateSetting("task_auto_mark_in_progress_on_open", val)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-gray-900">Auto-Close When Booked</Label>
              <p className="text-xs text-gray-500 mt-1">Close tasks when job is booked</p>
            </div>
            <Switch
              checked={settings.task_auto_close_on_booked ?? true}
              onCheckedChange={(val) => updateSetting("task_auto_close_on_booked", val)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-gray-900">Auto-Cancel On Reply</Label>
              <p className="text-xs text-gray-500 mt-1">Cancel tasks when lead replies</p>
            </div>
            <Switch
              checked={settings.task_auto_cancel_on_reply ?? false}
              onCheckedChange={(val) => updateSetting("task_auto_cancel_on_reply", val)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Layout Preferences Section
function LayoutSection({
  settings,
  updateSetting,
}: {
  settings: InboxSettings;
  updateSetting: <K extends keyof InboxSettings>(key: K, value: InboxSettings[K]) => void;
}) {
  const tabs = [
    "all",
    "hot",
    "warm",
    "follow_up",
    "booked",
    "activity",
    "tasks",
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Inbox Layout Preferences</h2>
        <p className="text-sm text-gray-600">
          Customize how your inbox looks and behaves
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">Default Inbox Tab</Label>
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => updateSetting("layout_default_tab", tab)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  (settings.layout_default_tab ?? "all") === tab
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                {tab === "follow_up" ? "Follow-Up" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">
            Thread Preview Length (characters)
          </Label>
          <input
            type="number"
            min="50"
            max="500"
            value={settings.layout_thread_preview_length ?? 150}
            onChange={(e) => updateSetting("layout_thread_preview_length", parseInt(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">Layout Mode</Label>
          <div className="flex gap-2">
            {(["compact", "comfortable"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => updateSetting("layout_mode", mode)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  (settings.layout_mode ?? "comfortable") === mode
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-gray-900">Show Lead Score</Label>
            <Switch
              checked={settings.layout_show_lead_score ?? true}
              onCheckedChange={(val) => updateSetting("layout_show_lead_score", val)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-gray-900">Show Contact Phone</Label>
            <Switch
              checked={settings.layout_show_contact_phone ?? true}
              onCheckedChange={(val) => updateSetting("layout_show_contact_phone", val)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-gray-900">Show Tags</Label>
            <Switch
              checked={settings.layout_show_tags ?? true}
              onCheckedChange={(val) => updateSetting("layout_show_tags", val)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-gray-900">Show Activity Feed</Label>
            <Switch
              checked={settings.layout_show_activity_feed ?? true}
              onCheckedChange={(val) => updateSetting("layout_show_activity_feed", val)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-gray-900">Show AI Summary</Label>
            <Switch
              checked={settings.layout_show_ai_summary ?? true}
              onCheckedChange={(val) => updateSetting("layout_show_ai_summary", val)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Team Section (placeholder for future implementation)
function TeamSection({
  settings,
  updateSetting,
}: {
  settings: InboxSettings;
  updateSetting: <K extends keyof InboxSettings>(key: K, value: InboxSettings[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Team Access & Permissions</h2>
        <p className="text-sm text-gray-600">
          Configure team member access and permissions for inbox features
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Team Permissions</h3>
          <p className="text-sm text-gray-600 mb-4">
            Team permissions are managed at the workspace level.
          </p>
          <Button onClick={() => window.location.href = "/settings/team"}>
            Go to Team Settings
          </Button>
        </div>
      </div>
    </div>
  );
}

// AI Personalization Section
function AISection({
  settings,
  updateSetting,
}: {
  settings: InboxSettings;
  updateSetting: <K extends keyof InboxSettings>(key: K, value: InboxSettings[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">AI Personalization</h2>
        <p className="text-sm text-gray-600">
          Customize AI behavior to match your business style and market
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">AI Tone</Label>
          <div className="flex gap-2">
            {(["friendly", "professional", "direct"] as const).map((tone) => (
              <button
                key={tone}
                onClick={() => updateSetting("ai_tone", tone)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  (settings.ai_tone ?? "professional") === tone
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                {tone.charAt(0).toUpperCase() + tone.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">Industry Variant</Label>
          <div className="flex flex-wrap gap-2">
            {(["roofing", "gutters", "solar", "siding", "windows", "general"] as const).map((variant) => (
              <button
                key={variant}
                onClick={() => updateSetting("ai_industry_variant", variant)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  (settings.ai_industry_variant ?? "roofing") === variant
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                {variant.charAt(0).toUpperCase() + variant.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-900">Region ZIP Code</Label>
          <input
            type="text"
            placeholder="e.g., 90210"
            value={settings.ai_region_zip || ""}
            onChange={(e) => updateSetting("ai_region_zip", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500">For region-specific references and weather patterns</p>
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-gray-900">Insurance-Heavy Workflow</Label>
              <p className="text-xs text-gray-500 mt-1">Focus on insurance claim workflows</p>
            </div>
            <Switch
              checked={settings.ai_insurance_heavy ?? false}
              onCheckedChange={(val) => updateSetting("ai_insurance_heavy", val)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-gray-900">Retail-Heavy Workflow</Label>
              <p className="text-xs text-gray-500 mt-1">Focus on direct customer sales</p>
            </div>
            <Switch
              checked={settings.ai_retail_heavy ?? true}
              onCheckedChange={(val) => updateSetting("ai_retail_heavy", val)}
            />
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-semibold text-gray-900">Pricing Guidance Sensitivity</Label>
            <span className="text-sm font-semibold text-blue-600">
              {(settings.ai_pricing_guidance_sensitivity ?? 3.0).toFixed(1)}
            </span>
          </div>
          <Slider
            value={[settings.ai_pricing_guidance_sensitivity ?? 3.0]}
            onValueChange={(val) => updateSetting("ai_pricing_guidance_sensitivity", val[0])}
            min={0}
            max={5}
            step={0.1}
            className="w-full"
          />
          <p className="text-xs text-gray-500">How sensitive AI should be with pricing guidance (0-5)</p>
        </div>
      </div>
    </div>
  );
}












































