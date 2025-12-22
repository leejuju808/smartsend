"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Shield, Lock, Smartphone, Bell } from "lucide-react";

interface SecuritySettingsProps {
  canEdit: boolean;
}

export default function SecuritySettings({ canEdit }: SecuritySettingsProps) {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [sessionHistoryEnabled, setSessionHistoryEnabled] = useState(true);
  const [deviceManagementEnabled, setDeviceManagementEnabled] = useState(true);
  const [passwordResetEnabled, setPasswordResetEnabled] = useState(true);
  const [loginNotificationsEnabled, setLoginNotificationsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings/security");
      const data = await res.json();
      
      if (data.settings?.security) {
        const security = data.settings.security;
        setTwoFactorEnabled(security.two_factor_enabled || false);
        setSessionHistoryEnabled(security.session_history_enabled !== false);
        setDeviceManagementEnabled(security.device_management_enabled !== false);
        setPasswordResetEnabled(security.password_reset_enabled !== false);
        setLoginNotificationsEnabled(security.login_notifications_enabled !== false);
      }
    } catch (error) {
      console.error("Failed to load security settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          security: {
            two_factor_enabled: twoFactorEnabled,
            session_history_enabled: sessionHistoryEnabled,
            device_management_enabled: deviceManagementEnabled,
            password_reset_enabled: passwordResetEnabled,
            login_notifications_enabled: loginNotificationsEnabled,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Security settings updated!");
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
        <h1 className="text-2xl font-semibold mb-2">Security</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  const securityOptions = [
    { key: "twoFactor", label: "2FA", icon: Shield, enabled: twoFactorEnabled, setter: setTwoFactorEnabled },
    { key: "sessionHistory", label: "Session History", icon: Lock, enabled: sessionHistoryEnabled, setter: setSessionHistoryEnabled },
    { key: "deviceManagement", label: "Device Management", icon: Smartphone, enabled: deviceManagementEnabled, setter: setDeviceManagementEnabled },
    { key: "passwordReset", label: "Password Reset", icon: Lock, enabled: passwordResetEnabled, setter: setPasswordResetEnabled },
    { key: "loginNotifications", label: "Login Notifications", icon: Bell, enabled: loginNotificationsEnabled, setter: setLoginNotificationsEnabled },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Security</h1>
        <p className="text-sm text-gray-600">
          Security controls: 2FA, session history, device management, password reset, login notifications
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        {securityOptions.map((option) => {
          const Icon = option.icon;
          return (
            <div
              key={option.key}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">{option.label}</span>
              </div>
              {canEdit && (
                <input
                  type="checkbox"
                  checked={option.enabled}
                  onChange={(e) => option.setter(e.target.checked)}
                  className="rounded"
                />
              )}
            </div>
          );
        })}

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





















































