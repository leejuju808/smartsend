"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";

interface NotificationsSettingsProps {
  canEdit: boolean;
}

export default function NotificationsSettings({ canEdit }: NotificationsSettingsProps) {
  const [notifications, setNotifications] = useState({
    notify_new_reply: true,
    notify_hot_lead: true,
    notify_insurance_signals: true,
    notify_appointment_booked: true,
    notify_appointment_canceled: false,
    notify_task_overdue: true,
    notify_domain_health_warnings: true,
    notify_billing_issues: true,
    notify_team_member_actions: false,
    daily_summary_enabled: true,
  });

  const [methods, setMethods] = useState({
    notify_via_email: true,
    notify_via_sms: false,
    notify_via_in_app: true,
  });

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

      if (data.notifications) {
        setNotifications({
          notify_new_reply: data.notifications.notify_new_reply ?? true,
          notify_hot_lead: data.notifications.notify_hot_lead ?? true,
          notify_insurance_signals: data.notifications.notify_insurance_signals ?? true,
          notify_appointment_booked: data.notifications.notify_appointment_booked ?? true,
          notify_appointment_canceled: data.notifications.notify_appointment_canceled ?? false,
          notify_task_overdue: data.notifications.notify_task_overdue ?? true,
          notify_domain_health_warnings: data.notifications.notify_domain_health_warnings ?? true,
          notify_billing_issues: data.notifications.notify_billing_issues ?? true,
          notify_team_member_actions: data.notifications.notify_team_member_actions ?? false,
          daily_summary_enabled: data.notifications.daily_summary_enabled ?? true,
        });
        setMethods({
          notify_via_email: data.notifications.notify_via_email ?? true,
          notify_via_sms: data.notifications.notify_via_sms ?? false,
          notify_via_in_app: data.notifications.notify_via_in_app ?? true,
        });
      }
    } catch (error) {
      console.error("Failed to load notifications:", error);
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
          section: "notifications",
          data: {
            ...notifications,
            ...methods,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Notification settings saved!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleNotification = (key: keyof typeof notifications) => {
    if (!canEdit) return;
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleMethod = (key: keyof typeof methods) => {
    if (!canEdit) return;
    setMethods((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Notifications</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Notifications</h1>
        <p className="text-sm text-gray-600">
          Choose which events trigger notifications and how you want to be notified
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-4">Notification Events</h3>
          <div className="space-y-3">
            {[
              { key: "notify_new_reply", label: "New Reply", popular: true },
              { key: "notify_hot_lead", label: "Hot Lead Detected", popular: true },
              { key: "notify_insurance_signals", label: "Insurance Signals", popular: true },
              { key: "notify_appointment_booked", label: "Appointment Booked", popular: true },
              { key: "notify_appointment_canceled", label: "Appointment Canceled", popular: false },
              { key: "notify_task_overdue", label: "Task Overdue", popular: false },
              { key: "notify_domain_health_warnings", label: "Domain Health Warnings", popular: false },
              { key: "notify_billing_issues", label: "Billing Issues", popular: false },
              { key: "notify_team_member_actions", label: "Team Member Actions", popular: false },
            ].map(({ key, label, popular }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">{label}</label>
                  {popular && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      Popular
                    </span>
                  )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications[key as keyof typeof notifications]}
                    onChange={() => toggleNotification(key as keyof typeof notifications)}
                    disabled={!canEdit}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Daily Summary</h3>
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between border p-4 rounded-xl">
              <div>
                <label className="text-sm font-medium text-gray-700">Daily Money Summary</label>
                <p className="text-xs text-gray-500">
                  Get a daily morning email showing yesterday's hot leads, follow-ups, and booked jobs.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifications.daily_summary_enabled}
                  onChange={() => toggleNotification("daily_summary_enabled")}
                  disabled={!canEdit}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Notification Methods</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <p className="text-xs text-gray-500">Receive notifications via email</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={methods.notify_via_email}
                  onChange={() => toggleMethod("notify_via_email")}
                  disabled={!canEdit}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">SMS</label>
                <p className="text-xs text-gray-500">Receive notifications via SMS (v2)</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={methods.notify_via_sms}
                  onChange={() => toggleMethod("notify_via_sms")}
                  disabled={!canEdit}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">In-App</label>
                <p className="text-xs text-gray-500">Show notifications in the app bell icon</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={methods.notify_via_in_app}
                  onChange={() => toggleMethod("notify_via_in_app")}
                  disabled={!canEdit}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
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











