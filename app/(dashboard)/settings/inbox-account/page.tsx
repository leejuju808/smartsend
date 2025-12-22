// Block 20160 — Inbox Settings Page (Account-Level, Owner-Only)

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InboxSettings {
  account_id: string;
  business_timezone: string;
  business_hours_start: string;
  business_hours_end: string;
  hot_sla_hours: number;
  warm_sla_hours: number;
  default_follow_up_days_small: number;
  default_follow_up_days_medium: number;
  default_follow_up_days_long: number;
  email_signature: string;
}

export default function InboxAccountSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<InboxSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/inbox/settings-account");
      if (!res.ok) {
        throw new Error("Failed to load settings");
      }
      const json = await res.json();
      setSettings(json.settings);
    } catch (error) {
      console.error("Error loading settings:", error);
      setMessage("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/inbox/settings-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save");
      }

      const json = await res.json();
      setSettings(json.settings);
      setMessage("Settings saved successfully!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error("Error saving settings:", error);
      setMessage(`Error: ${error.message}`);
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">Inbox Settings</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">Inbox Settings</h1>
        <p className="text-sm text-gray-500">Unable to load settings.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/settings")}
            className="p-0 h-auto"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Inbox Settings</h1>
            <p className="text-sm text-gray-500 mt-1">
              Configure business hours, SLA thresholds, and follow-up defaults for your account
            </p>
          </div>
        </div>
        <Button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 rounded-full bg-black text-white text-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.includes("Error") || message.includes("Failed")
              ? "bg-red-50 text-red-700"
              : "bg-green-50 text-green-700"
          }`}
        >
          {message}
        </div>
      )}

      <section className="space-y-3 bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-800">
          Business hours & timezone
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Timezone
            </label>
            <input
              type="text"
              value={settings.business_timezone}
              onChange={(e) =>
                setSettings({ ...settings, business_timezone: e.target.value })
              }
              className="w-full border rounded-lg px-2 py-1"
              placeholder="America/Los_Angeles"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start</label>
            <input
              type="time"
              value={settings.business_hours_start.slice(0, 5)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  business_hours_start: e.target.value + ":00",
                })
              }
              className="w-full border rounded-lg px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">End</label>
            <input
              type="time"
              value={settings.business_hours_end.slice(0, 5)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  business_hours_end: e.target.value + ":00",
                })
              }
              className="w-full border rounded-lg px-2 py-1"
            />
          </div>
        </div>
      </section>

      <section className="space-y-3 bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-800">
          Lead response targets (SLA)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Hot leads — max hours to reply
            </label>
            <input
              type="number"
              min={1}
              value={settings.hot_sla_hours}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  hot_sla_hours: Number(e.target.value),
                })
              }
              className="w-full border rounded-lg px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Warm leads — max hours to reply
            </label>
            <input
              type="number"
              min={1}
              value={settings.warm_sla_hours}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  warm_sla_hours: Number(e.target.value),
                })
              }
              className="w-full border rounded-lg px-2 py-1"
            />
          </div>
        </div>
        <p className="text-[11px] text-gray-500">
          These values control when SmartSend flags hot/warm leads as "waiting
          too long" in your Attention panel.
        </p>
      </section>

      <section className="space-y-3 bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-800">
          Default follow-up buttons
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <NumberInput
            label="+ small follow-up (days)"
            value={settings.default_follow_up_days_small}
            onChange={(v) =>
              setSettings({ ...settings, default_follow_up_days_small: v })
            }
          />
          <NumberInput
            label="+ medium follow-up (days)"
            value={settings.default_follow_up_days_medium}
            onChange={(v) =>
              setSettings({ ...settings, default_follow_up_days_medium: v })
            }
          />
          <NumberInput
            label="+ long follow-up (days)"
            value={settings.default_follow_up_days_long}
            onChange={(v) =>
              setSettings({ ...settings, default_follow_up_days_long: v })
            }
          />
        </div>
        <p className="text-[11px] text-gray-500">
          These control the quick follow-up buttons in your Lead Action Bar.
        </p>
      </section>

      <section className="space-y-3 bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-800">
          Email signature (optional)
        </h2>
        <textarea
          value={settings.email_signature || ""}
          onChange={(e) =>
            setSettings({ ...settings, email_signature: e.target.value })
          }
          rows={4}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder={`[Your Name]\n[Roofing Company]\n[Phone]\n[License #]`}
        />
        <p className="text-[11px] text-gray-500">
          This can be auto-added to replies later so your team stays consistent.
        </p>
      </section>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full border rounded-lg px-2 py-1"
      />
    </div>
  );
}

















































