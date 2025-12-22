"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Bell, Save, Clock, Eye } from "lucide-react";

interface Preferences {
  zero_notification_mode?: boolean;
  notification_hot_lead?: boolean;
  notification_reply?: boolean;
  notification_task_due?: boolean;
  notification_campaign_error?: boolean;
  default_task_reminder_hours?: number;
  default_task_offset_hours?: number;
  default_contact_view?: string;
  default_reply_inbox_sort?: string;
  default_work_hours_start?: string;
  default_work_hours_end?: string;
}

export default function PreferencesSettings({ canEdit }: { canEdit: boolean }) {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>({});

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch("/api/settings/org", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
      }
    } catch (error) {
      console.error("Error loading preferences:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch("/api/settings/org", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        alert("Preferences saved successfully!");
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error saving preferences:", error);
      alert("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Workspace Preferences</h2>
        <p className="mt-1 text-sm text-gray-600">
          Customize notifications and default settings
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Notifications */}
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </h3>
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-900">🕳️ Zero-Notification Mode</span>
                <p className="text-xs text-gray-500">
                  Silent by default. Only alerts on hot leads + approved estimates.
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.zero_notification_mode ?? false}
                onChange={(e) =>
                  setPreferences({ ...preferences, zero_notification_mode: e.target.checked })
                }
                disabled={!canEdit}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </label>
            <label className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-900">🔥 Hot Lead Alerts</span>
                <p className="text-xs text-gray-500">Get notified when a lead shows high intent</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.notification_hot_lead ?? true}
                onChange={(e) =>
                  setPreferences({ ...preferences, notification_hot_lead: e.target.checked })
                }
                disabled={!canEdit || (preferences.zero_notification_mode ?? false)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </label>
            <label className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-900">💬 Reply Alerts</span>
                <p className="text-xs text-gray-500">Get notified when someone replies to your emails</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.notification_reply ?? true}
                onChange={(e) =>
                  setPreferences({ ...preferences, notification_reply: e.target.checked })
                }
                disabled={!canEdit || (preferences.zero_notification_mode ?? false)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </label>
            <label className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-900">⏰ Task Reminders</span>
                <p className="text-xs text-gray-500">Get reminded about upcoming tasks</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.notification_task_due ?? true}
                onChange={(e) =>
                  setPreferences({ ...preferences, notification_task_due: e.target.checked })
                }
                disabled={!canEdit || (preferences.zero_notification_mode ?? false)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </label>
            <label className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-900">📧 Campaign Send Errors</span>
                <p className="text-xs text-gray-500">Get notified when emails fail to send</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.notification_campaign_error ?? true}
                onChange={(e) =>
                  setPreferences({ ...preferences, notification_campaign_error: e.target.checked })
                }
                disabled={!canEdit || (preferences.zero_notification_mode ?? false)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </label>
          </div>
        </div>

        {/* Task Preferences */}
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Task Preferences
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Task Due Date Offset (hours)
              </label>
              <input
                type="number"
                value={preferences.default_task_offset_hours ?? 24}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    default_task_offset_hours: parseInt(e.target.value),
                  })
                }
                disabled={!canEdit}
                min={1}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Task Reminder Time (hours after midnight)
              </label>
              <input
                type="number"
                value={preferences.default_task_reminder_hours ?? 9}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    default_task_reminder_hours: parseInt(e.target.value),
                  })
                }
                disabled={!canEdit}
                min={0}
                max={23}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
              />
              <p className="text-xs text-gray-500 mt-1">e.g., 9 = 9 AM</p>
            </div>
          </div>
        </div>

        {/* Display Preferences */}
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Display Preferences
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Contact View
              </label>
              <select
                value={preferences.default_contact_view || "table"}
                onChange={(e) =>
                  setPreferences({ ...preferences, default_contact_view: e.target.value })
                }
                disabled={!canEdit}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
              >
                <option value="table">Table</option>
                <option value="card">Card</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reply Inbox Sort Order
              </label>
              <select
                value={preferences.default_reply_inbox_sort || "newest"}
                onChange={(e) =>
                  setPreferences({ ...preferences, default_reply_inbox_sort: e.target.value })
                }
                disabled={!canEdit}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
              >
                <option value="newest">Newest First</option>
                <option value="intent">By Intent</option>
              </select>
            </div>
          </div>
        </div>

        {/* Save Button */}
        {canEdit && (
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}





























































