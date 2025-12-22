"use client";

import { useState, useEffect } from "react";
import { Bell, Save } from "lucide-react";

interface NotificationsTabProps {
  roofingCompanyId: string;
}

const modules = [
  { id: 'sales', label: 'Sales', description: 'New leads, proposals viewed, contracts signed' },
  { id: 'production', label: 'Production', description: 'Job started, job completed, crew assignments' },
  { id: 'safety', label: 'Safety', description: 'Safety incidents, compliance alerts' },
  { id: 'payments', label: 'Payments', description: 'Payment received, invoice sent, payment overdue' },
  { id: 'crew', label: 'Crew', description: 'Crew check-in, check-out, daily logs' },
  { id: 'general', label: 'General', description: 'System updates, account changes' },
];

export default function NotificationsTab({ roofingCompanyId }: NotificationsTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, { notify_email: boolean; notify_sms: boolean; notify_inapp: boolean }>>({});

  useEffect(() => {
    loadSettings();
  }, [roofingCompanyId]);

  const loadSettings = async () => {
    try {
      const response = await fetch(`/api/user/notifications/list?roofing_company_id=${roofingCompanyId}`);
      const data = await response.json();
      if (data.success) {
        // Initialize with defaults if not set
        const loaded: Record<string, any> = {};
        modules.forEach((module) => {
          loaded[module.id] = data.notifications[module.id] || {
            notify_email: true,
            notify_sms: false,
            notify_inapp: true,
          };
        });
        setSettings(loaded);
      }
    } catch (error) {
      console.error("Error loading notification settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save each module's settings
      const promises = modules.map((module) => {
        const moduleSettings = settings[module.id];
        return fetch("/api/user/notifications/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roofing_company_id: roofingCompanyId,
            module: module.id,
            ...moduleSettings,
          }),
        });
      });

      await Promise.all(promises);
      alert("Notification settings saved successfully!");
    } catch (error) {
      console.error("Error saving:", error);
      alert("Failed to save notification settings");
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (moduleId: string, key: 'notify_email' | 'notify_sms' | 'notify_inapp', value: boolean) => {
    setSettings({
      ...settings,
      [moduleId]: {
        ...settings[moduleId],
        [key]: value,
      },
    });
  };

  if (loading) {
    return <div className="text-center py-8">Loading notification settings...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center">
          <Bell className="w-6 h-6 text-gray-600 mr-3" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
            <p className="text-sm text-gray-500 mt-1">Configure how you receive notifications</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {modules.map((module) => {
          const moduleSettings = settings[module.id] || {
            notify_email: true,
            notify_sms: false,
            notify_inapp: true,
          };

          return (
            <div key={module.id} className="border border-gray-200 rounded-lg p-4">
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900">{module.label}</h3>
                <p className="text-sm text-gray-500">{module.description}</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id={`${module.id}-email`}
                    checked={moduleSettings.notify_email}
                    onChange={(e) => updateSetting(module.id, 'notify_email', e.target.checked)}
                    className="mr-2"
                  />
                  <label htmlFor={`${module.id}-email`} className="text-sm text-gray-700">
                    Email
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id={`${module.id}-sms`}
                    checked={moduleSettings.notify_sms}
                    onChange={(e) => updateSetting(module.id, 'notify_sms', e.target.checked)}
                    className="mr-2"
                  />
                  <label htmlFor={`${module.id}-sms`} className="text-sm text-gray-700">
                    SMS
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id={`${module.id}-inapp`}
                    checked={moduleSettings.notify_inapp}
                    onChange={(e) => updateSetting(module.id, 'notify_inapp', e.target.checked)}
                    className="mr-2"
                  />
                  <label htmlFor={`${module.id}-inapp`} className="text-sm text-gray-700">
                    In-App
                  </label>
                </div>
              </div>
            </div>
          );
        })}

        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

























