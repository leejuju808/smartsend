// app/settings/notifications/page.tsx
// Block 8640 — Notification Settings Page (Hot Lead Alerts + Daily Digest)

"use client";

import { useEffect, useState } from "react";

type NotificationSettings = {
  notify_hot_leads: boolean;
  notify_daily_digest: boolean;
  digest_hour_local: number;
};

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>({
    notify_hot_leads: true,
    notify_daily_digest: true,
    digest_hour_local: 18,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/notifications");
        const data = await res.json();
        setSettings(data);
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
      setMessage("Notification settings saved.");
      setTimeout(() => setMessage(null), 2000);
    } catch (e) {
      console.error("Save notification settings error:", e);
    } finally {
      setSaving(false);
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
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
