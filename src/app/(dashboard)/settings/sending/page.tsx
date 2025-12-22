"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function SendingSettings() {
  const [tz, setTz] = useState("America/Los_Angeles");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [skip, setSkip] = useState(true);
  const [cap, setCap] = useState(300);
  const [respectLeadTimezone, setRespectLeadTimezone] = useState(true);
  const [globalWindowStart, setGlobalWindowStart] = useState("08:00");
  const [globalWindowEnd, setGlobalWindowEnd] = useState("18:00");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
      fetch("/api/workspace/send-settings")
      .then((r) => r.json())
      .then((j) => {
        if (j) {
          setTz(j.timezone || j.sending_timezone || "America/Los_Angeles");
          setStart(j.window_start || j.default_sending_window_start || "09:00");
          setEnd(j.window_end || j.default_sending_window_end || "17:00");
          setSkip(j.skip_weekends ?? j.restrict_to_business_days ?? true);
          setCap(j.daily_cap || j.default_daily_send_cap || 300);
          setRespectLeadTimezone(j.respect_lead_timezone ?? true);
          setGlobalWindowStart(j.global_send_window_start || "08:00");
          setGlobalWindowEnd(j.global_send_window_end || "18:00");
        }
      })
      .catch((e) => {
        console.error("Failed to load settings:", e);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/workspace/send-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: tz,
          sending_timezone: tz,
          window_start: start,
          window_end: end,
          default_sending_window_start: start,
          default_sending_window_end: end,
          skip_weekends: skip,
          restrict_to_business_days: skip,
          daily_cap: cap,
          default_daily_send_cap: cap,
          respect_lead_timezone: respectLeadTimezone,
          global_send_window_start: globalWindowStart,
          global_send_window_end: globalWindowEnd,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }

      setMessage("Settings saved!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Sending Settings</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Sending Settings</h1>
      <p className="text-sm text-muted-foreground">
        Configure when emails are sent and daily sending limits
      </p>

      <div className="max-w-2xl space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Timezone</label>
            <Input
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              placeholder="America/Los_Angeles"
            />
            <p className="text-xs text-muted-foreground mt-1">
              IANA timezone (e.g., America/New_York)
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Window Start</label>
            <Input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Window End</label>
            <Input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Daily Cap</label>
            <Input
              type="number"
              value={cap}
              onChange={(e) => setCap(+e.target.value)}
              min={1}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={skip}
                onChange={(e) => setSkip(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Restrict sending to business days only (skip weekends)</span>
            </label>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={respectLeadTimezone}
                onChange={() => setRespectLeadTimezone(true)}
                className="rounded"
              />
              <span className="text-sm">Respect lead local timezone</span>
            </label>
            <label className="flex items-center gap-2 ml-6">
              <input
                type="radio"
                checked={!respectLeadTimezone}
                onChange={() => setRespectLeadTimezone(false)}
                className="rounded"
              />
              <span className="text-sm">Use workspace timezone only</span>
            </label>
          </div>

          <div className="border-t pt-3">
            <h3 className="text-sm font-medium mb-2">Global Send Window (Workspace Time)</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Start</label>
                <Input
                  type="time"
                  value={globalWindowStart}
                  onChange={(e) => setGlobalWindowStart(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">End</label>
                <Input
                  type="time"
                  value={globalWindowEnd}
                  onChange={(e) => setGlobalWindowEnd(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Global "do not send" hours. Leads will only be sent during this window (in workspace time).
            </p>
          </div>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>

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

