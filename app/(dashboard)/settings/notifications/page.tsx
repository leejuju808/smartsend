// app/(dashboard)/settings/notifications/page.tsx
// Block 8640 — Hot Lead Alerts + Daily Digest UI
// Block 9700 — SMS Forwarding v1

"use client";

import { useEffect, useState } from "react";

type NotificationSettings = {
  notify_hot_leads: boolean;
  notify_daily_digest: boolean;
  digest_hour_local: number;
};

type SMSNotificationSettings = {
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  sms_enabled: boolean;
  sms_hot_leads: boolean;
  sms_warm_leads: boolean;
  sms_estimate_scheduled: boolean;
  sms_won_jobs: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>({
    notify_hot_leads: true,
    notify_daily_digest: true,
    digest_hour_local: 18,
  });
  const [smsSettings, setSmsSettings] = useState<SMSNotificationSettings>({
    owner_name: null,
    owner_email: null,
    owner_phone: null,
    sms_enabled: false,
    sms_hot_leads: true,
    sms_warm_leads: false,
    sms_estimate_scheduled: false,
    sms_won_jobs: true,
    quiet_hours_start: null,
    quiet_hours_end: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSms, setSavingSms] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [emailRes, smsRes] = await Promise.all([
          fetch("/api/settings/notifications"),
          fetch("/api/notifications/settings"),
        ]);
        const emailData = await emailRes.json();
        const smsData = await smsRes.json();
        setSettings(emailData);
        setSmsSettings(smsData);
      } catch (e) {
        console.error("Load notification settings error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setMessage("Email notification settings saved.");
      setTimeout(() => setMessage(null), 2000);
    } catch (e) {
      console.error("Save notification settings error:", e);
      setMessage("Failed to save settings.");
      setTimeout(() => setMessage(null), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function saveSms() {
    setSavingSms(true);
    setMessage(null);
    try {
      const res = await fetch("/api/notifications/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smsSettings),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save SMS settings");
      }
      const data = await res.json();
      setSmsSettings(data);
      setMessage("SMS notification settings saved.");
      setTimeout(() => setMessage(null), 2000);
    } catch (e: any) {
      console.error("Save SMS notification settings error:", e);
      setMessage(e.message || "Failed to save SMS settings.");
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setSavingSms(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold text-neutral-50">
          Notifications
        </h1>
        <p className="text-sm text-neutral-400">
          Choose when SmartSend should alert you about new roof leads.
        </p>
      </header>

      {message && (
        <div className="rounded-xl border border-emerald-700 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      )}

      <div className="flex flex-col gap-4 max-w-lg">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={settings.notify_hot_leads}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                notify_hot_leads: e.target.checked,
              }))
            }
            className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950"
          />
          <span className="text-sm text-neutral-200">
            Instant alerts for <span className="text-amber-400">Hot Leads</span>
            <span className="block text-xs text-neutral-400">
              When a homeowner replies with high intent, SmartSend will email
              you immediately.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={settings.notify_daily_digest}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                notify_daily_digest: e.target.checked,
              }))
            }
            className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950"
          />
          <span className="text-sm text-neutral-200">
            Daily summary digest
            <span className="block text-xs text-neutral-400">
              Get a short email with today&apos;s emails sent, replies, and hot
              leads.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3 text-sm text-neutral-200">
          <span>Digest send time (local hour)</span>
          <input
            type="number"
            min={0}
            max={23}
            value={settings.digest_hour_local}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                digest_hour_local: Number(e.target.value),
              }))
            }
            className="w-20 rounded-xl border border-neutral-700 bg-neutral-950/60 px-2 py-1 text-center text-neutral-100"
          />
          <span className="text-xs text-neutral-500">
            18 = 6 PM, 20 = 8 PM, etc.
          </span>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-2 w-fit rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save Email Settings"}
      </button>

      {/* SMS Notification Settings */}
      <div className="mt-12 border-t border-neutral-800 pt-8">
        <header>
          <h2 className="text-lg font-semibold text-neutral-50">
            SMS Alerts
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Get instant text messages when hot leads come in, even if you&apos;re on a roof or driving.
          </p>
        </header>

        <div className="flex flex-col gap-6 max-w-lg mt-6">
          {/* Owner Contact Info */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-medium text-neutral-300">Owner Contact Info</h3>
            
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Owner Name</label>
              <input
                type="text"
                value={smsSettings.owner_name || ""}
                onChange={(e) =>
                  setSmsSettings((prev) => ({ ...prev, owner_name: e.target.value || null }))
                }
                placeholder="John Smith"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Owner Email</label>
              <input
                type="email"
                value={smsSettings.owner_email || ""}
                onChange={(e) =>
                  setSmsSettings((prev) => ({ ...prev, owner_email: e.target.value || null }))
                }
                placeholder="john@example.com"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                Owner Mobile Number <span className="text-amber-400">*</span>
              </label>
              <input
                type="tel"
                value={smsSettings.owner_phone || ""}
                onChange={(e) =>
                  setSmsSettings((prev) => ({ ...prev, owner_phone: e.target.value || null }))
                }
                placeholder="+15551234567"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Use E.164 format: +1 followed by 10 digits (e.g., +15551234567)
              </p>
            </div>
          </div>

          {/* SMS Enable Toggle */}
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={smsSettings.sms_enabled}
              onChange={(e) =>
                setSmsSettings((prev) => ({ ...prev, sms_enabled: e.target.checked }))
              }
              className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950"
            />
            <span className="text-sm text-neutral-200">
              Enable SMS alerts to my phone
              <span className="block text-xs text-neutral-400 mt-1">
                When a homeowner replies and looks serious, SmartSend will text you so you can call them immediately.
              </span>
            </span>
          </label>

          {/* Alert Types */}
          {smsSettings.sms_enabled && (
            <div className="flex flex-col gap-4 pl-7">
              <h3 className="text-sm font-medium text-neutral-300">Alert Types</h3>
              
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={smsSettings.sms_hot_leads}
                  onChange={(e) =>
                    setSmsSettings((prev) => ({ ...prev, sms_hot_leads: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950"
                />
                <span className="text-sm text-neutral-200">
                  Text me for <span className="text-amber-400">HOT</span> leads
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={smsSettings.sms_warm_leads}
                  onChange={(e) =>
                    setSmsSettings((prev) => ({ ...prev, sms_warm_leads: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950"
                />
                <span className="text-sm text-neutral-200">
                  Text me for <span className="text-blue-400">WARM</span> leads
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={smsSettings.sms_won_jobs}
                  onChange={(e) =>
                    setSmsSettings((prev) => ({ ...prev, sms_won_jobs: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950"
                />
                <span className="text-sm text-neutral-200">
                  Text me when a job is <span className="text-emerald-400">WON</span>
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={smsSettings.sms_estimate_scheduled}
                  onChange={(e) =>
                    setSmsSettings((prev) => ({ ...prev, sms_estimate_scheduled: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950"
                />
                <span className="text-sm text-neutral-200">
                  Text me when an estimate is scheduled
                </span>
              </label>
            </div>
          )}

          {/* Quiet Hours */}
          {smsSettings.sms_enabled && (
            <div className="flex flex-col gap-4 pl-7">
              <h3 className="text-sm font-medium text-neutral-300">Quiet Hours (Optional)</h3>
              <p className="text-xs text-neutral-400">
                Don&apos;t send SMS during these hours (e.g., 9 PM to 7 AM)
              </p>
              
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400">From</span>
                  <input
                    type="time"
                    value={smsSettings.quiet_hours_start || ""}
                    onChange={(e) =>
                      setSmsSettings((prev) => ({
                        ...prev,
                        quiet_hours_start: e.target.value || null,
                      }))
                    }
                    className="rounded-xl border border-neutral-700 bg-neutral-950/60 px-2 py-1 text-sm text-neutral-100"
                  />
                </label>
                <span className="text-xs text-neutral-500">to</span>
                <label className="flex items-center gap-2">
                  <input
                    type="time"
                    value={smsSettings.quiet_hours_end || ""}
                    onChange={(e) =>
                      setSmsSettings((prev) => ({
                        ...prev,
                        quiet_hours_end: e.target.value || null,
                      }))
                    }
                    className="rounded-xl border border-neutral-700 bg-neutral-950/60 px-2 py-1 text-sm text-neutral-100"
                  />
                </label>
              </div>
            </div>
          )}

          <button
            onClick={saveSms}
            disabled={savingSms || !smsSettings.owner_phone}
            className="mt-2 w-fit rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {savingSms ? "Saving…" : "Save SMS Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}


