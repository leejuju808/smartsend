// app/(dashboard)/settings/sending/page.tsx
"use client";

import { useEffect, useState } from "react";

type Settings = {
  from_name: string;
  from_email: string;
  reply_to_email: string;
};

export default function SendingSettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    from_name: "",
    from_email: "",
    reply_to_email: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/sending", {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        setSettings({
          from_name: data.from_name || "",
          from_email: data.from_email || "",
          reply_to_email: data.reply_to_email || "",
        });
      } catch (err) {
        console.error("Error loading sending settings:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/sending", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to save settings");
      }

      setMessage("Sending settings saved.");
    } catch (err: any) {
      console.error("Save error:", err);
      setError(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 2000);
    }
  }

  async function handleTestSend() {
    setTesting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/sending/test", {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to send test email");
      }

      setMessage("Test email sent. Check your inbox.");
    } catch (err: any) {
      console.error("Test send error:", err);
      setError(err.message ?? "Failed to send test email");
    } finally {
      setTesting(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        Loading sending settings…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold text-neutral-50">
          Sending Settings
        </h1>
        <p className="text-sm text-neutral-400">
          Set the name and email SmartSend uses when contacting homeowners.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-700 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-700 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      )}

      <div className="flex flex-col gap-4 max-w-lg">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-neutral-300">From Name</label>
          <input
            type="text"
            value={settings.from_name}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                from_name: e.target.value,
              }))
            }
            className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100"
            placeholder="e.g. John from Apex Roofing"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-neutral-300">From Email</label>
          <input
            type="email"
            value={settings.from_email}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                from_email: e.target.value,
              }))
            }
            className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100"
            placeholder="e.g. john@apexroofing.com"
          />
          <span className="text-xs text-neutral-500">
            This email will appear in the "From" line for homeowners.
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-neutral-300">Reply-To (optional)</label>
          <input
            type="email"
            value={settings.reply_to_email}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                reply_to_email: e.target.value,
              }))
            }
            className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100"
            placeholder="Where replies should go (if different)"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>

        <button
          type="button"
          onClick={handleTestSend}
          disabled={testing}
          className="rounded-xl border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-100 disabled:opacity-60"
        >
          {testing ? "Sending test…" : "Send Test Email"}
        </button>
      </div>
    </div>
  );
}
