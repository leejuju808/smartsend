"use client";

import { useEffect, useState } from "react";

type Health = {
  sender_id: string;
  sender_email: string;
  status: "active" | "paused_bounce" | "paused_manual";
  daily_cap: number;
  ramp_step: number;
  max_daily_cap: number;
  max_bounce_pct: number;
  bounce_window_days: number;
  today_count: number;
  today_date: string;
  sends_7d: number;
  bounces_7d: number;
  bounce_rate_7d: number;
};

type Alert = {
  id: string;
  sender_id: string;
  level: "info" | "warning" | "error";
  code: string;
  message: string;
  meta?: any;
  created_at: string;
  acknowledged_at?: string | null;
};

export default function SafetyPage() {
  const [senders, setSenders] = useState<Health[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const [sRes, aRes] = await Promise.all([
        fetch("/api/safety/senders", { cache: "no-store" }),
        fetch("/api/safety/alerts", { cache: "no-store" }),
      ]);
      const sJson = await sRes.json();
      const aJson = await aRes.json();
      if (!sJson.success) throw new Error(sJson.error);
      if (!aJson.success) throw new Error(aJson.error);
      setSenders(sJson.senders || []);
      setAlerts(aJson.alerts || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function updateSender(sender_id: string, patch: Partial<Health>) {
    const res = await fetch("/api/safety/senders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: sender_id, patch }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Update failed");
    await load();
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Send Safety</h1>
        <p className="text-sm text-muted-foreground">
          Auto-ramp volume, guard bounce spikes, and keep your domains healthy.
        </p>
      </div>

      {loading && <div>Loading…</div>}
      {err && <div className="text-red-600">{err}</div>}

      {!loading && !err && (
        <>
          <section className="rounded-2xl border p-4">
            <h2 className="text-lg font-semibold mb-3">Senders</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left">Email</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Cap Today</th>
                    <th className="p-3 text-left">Sent Today</th>
                    <th className="p-3 text-left">Ramp (+/day)</th>
                    <th className="p-3 text-left">Max Cap</th>
                    <th className="p-3 text-left">Bounce 7d</th>
                    <th className="p-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {senders.map((s) => (
                    <tr key={s.sender_id} className="border-t">
                      <td className="p-3">{s.sender_email}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs border ${
                          s.status === "active" ? "bg-green-50" : "bg-red-50"
                        }`}>{s.status}</span>
                      </td>
                      <td className="p-3">{s.daily_cap}</td>
                      <td className="p-3">{s.today_count}</td>
                      <td className="p-3">{s.ramp_step}</td>
                      <td className="p-3">{s.max_daily_cap}</td>
                      <td className="p-3">{s.bounce_rate_7d}% ({s.bounces_7d}/{s.sends_7d})</td>
                      <td className="p-3 space-x-2">
                        {s.status !== "active" ? (
                          <button
                            className="rounded border px-2 py-1"
                            onClick={() => updateSender(s.sender_id, { status: "active", paused_reason: null as any })}
                          >
                            Resume
                          </button>
                        ) : (
                          <button
                            className="rounded border px-2 py-1"
                            onClick={() => updateSender(s.sender_id, { status: "paused_manual", paused_reason: "Manual pause" })}
                          >
                            Pause
                          </button>
                        )}
                        <button
                          className="rounded border px-2 py-1"
                          onClick={() => updateSender(s.sender_id, { daily_cap: Math.max(10, s.daily_cap - s.ramp_step) })}
                        >
                          − Cap
                        </button>
                        <button
                          className="rounded border px-2 py-1"
                          onClick={() => updateSender(s.sender_id, { daily_cap: Math.min(s.max_daily_cap, s.daily_cap + s.ramp_step) })}
                        >
                          + Cap
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!senders.length && (
                    <tr><td className="p-3 text-muted-foreground" colSpan={8}>No senders yet — will auto-create on first check.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border p-4">
            <h2 className="text-lg font-semibold mb-3">Recent Alerts</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left">When</th>
                    <th className="p-3 text-left">Level</th>
                    <th className="p-3 text-left">Code</th>
                    <th className="p-3 text-left">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-3">{new Date(a.created_at).toLocaleString()}</td>
                      <td className="p-3">{a.level}</td>
                      <td className="p-3">{a.code}</td>
                      <td className="p-3">{a.message}</td>
                    </tr>
                  ))}
                  {!alerts.length && (
                    <tr><td className="p-3 text-muted-foreground" colSpan={4}>No alerts yet. Keep sending healthy ✨</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
