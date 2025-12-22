"use client";

import { useEffect, useState } from "react";

type Camp = {
  campaign_id: string;
  name: string;
  status: "draft" | "running" | "paused" | "completed";
  daily_cap: number;
  ramp_step: number;
  max_daily_cap: number;
  max_bounce_pct: number;
  max_complaint_pct: number;
  window_days: number;
  today_count: number;
  today_date: string;
  sends_7d: number;
  bounces_7d: number;
  complaints_7d: number;
  bounce_rate_7d: number;
  complaint_rate_7d: number;
};

type Alert = {
  id: string;
  campaign_id: string;
  level: "info" | "warning" | "error";
  code: string;
  message: string;
  meta?: any;
  created_at: string;
};

export default function CampaignSafetyPage() {
  const [rows, setRows] = useState<Camp[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [cRes, aRes] = await Promise.all([
        fetch("/api/safety/campaigns", { cache: "no-store" }),
        fetch("/api/safety/campaign-alerts", { cache: "no-store" }),
      ]);
      const cJson = await cRes.json();
      const aJson = await aRes.json();
      if (!cJson.success) throw new Error(cJson.error);
      if (!aJson.success) throw new Error(aJson.error);
      setRows(cJson.campaigns || []);
      setAlerts(aJson.alerts || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function updateCampaign(campaign_id: string, patch: Partial<Camp>) {
    const res = await fetch("/api/safety/campaigns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campaign_id, patch }),
    });
    const j = await res.json();
    if (!j.success) throw new Error(j.error || "Update failed");
    await load();
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Campaign Safety</h1>
        <p className="text-sm text-muted-foreground">Per-campaign ramp, caps, and complaint/bounce shields.</p>
      </div>

      {loading && <div>Loading…</div>}
      {err && <div className="text-red-600">{err}</div>}

      {!loading && !err && (
        <>
          <section className="rounded-2xl border p-4">
            <h2 className="text-lg font-semibold mb-3">Campaigns</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left">Name</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Cap Today</th>
                    <th className="p-3 text-left">Sent Today</th>
                    <th className="p-3 text-left">Ramp</th>
                    <th className="p-3 text-left">Max Cap</th>
                    <th className="p-3 text-left">Bounce 7d</th>
                    <th className="p-3 text-left">Complaint 7d</th>
                    <th className="p-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.campaign_id} className="border-t">
                      <td className="p-3">{c.name}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs border ${c.status === "running" ? "bg-green-50" : "bg-yellow-50"}`}>{c.status}</span>
                      </td>
                      <td className="p-3">{c.daily_cap}</td>
                      <td className="p-3">{c.today_count}</td>
                      <td className="p-3">{c.ramp_step}</td>
                      <td className="p-3">{c.max_daily_cap}</td>
                      <td className="p-3">{c.bounce_rate_7d}% ({c.bounces_7d}/{c.sends_7d})</td>
                      <td className="p-3">{c.complaint_rate_7d}% ({c.complaints_7d}/{c.sends_7d})</td>
                      <td className="p-3 space-x-2">
                        {c.status !== "running" ? (
                          <button className="rounded border px-2 py-1" onClick={() => updateCampaign(c.campaign_id, { status: "running" })}>
                            Resume
                          </button>
                        ) : (
                          <button className="rounded border px-2 py-1" onClick={() => updateCampaign(c.campaign_id, { status: "paused" })}>
                            Pause
                          </button>
                        )}
                        <button className="rounded border px-2 py-1" onClick={() => updateCampaign(c.campaign_id, { daily_cap: Math.max(10, c.daily_cap - c.ramp_step) })}>
                          − Cap
                        </button>
                        <button className="rounded border px-2 py-1" onClick={() => updateCampaign(c.campaign_id, { daily_cap: Math.min(c.max_daily_cap, c.daily_cap + c.ramp_step) })}>
                          + Cap
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td className="p-3 text-muted-foreground" colSpan={9}>No campaigns</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border p-4">
            <h2 className="text-lg font-semibold mb-3">Recent Campaign Alerts</h2>
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
                  {!alerts.length && <tr><td className="p-3 text-muted-foreground" colSpan={4}>No alerts yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
