"use client";

import React, { useState, useEffect } from "react";

type Campaign = {
  id: string;
  name: string;
  sender_email: string;
  status: "draft" | "running" | "paused" | "completed";
  created_at: string;
  launched_at: string | null;
};

export default function CampaignsPage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/_internal/campaigns/list");
    const j = await r.json();
    setRows(j.rows || []);
  }

  async function runBatch(id: string) {
    setLoading(true);
    setMsg(null);
    const res = await fetch("/api/send/worker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: id, batch_size: 20 }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMsg(`Error: ${data.error}`);
    } else {
      setMsg(`Batch result — sent: ${data.sent}, skipped: ${data.skipped}, failed: ${data.failed}`);
      await load();
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Campaigns</h1>

      {msg && <div className="rounded-xl border p-3 bg-emerald-50 text-emerald-900 text-sm">{msg}</div>}

      <div className="overflow-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-3 py-2 border-b">Name</th>
              <th className="text-left px-3 py-2 border-b">Sender</th>
              <th className="text-left px-3 py-2 border-b">Status</th>
              <th className="text-left px-3 py-2 border-b">Created</th>
              <th className="text-left px-3 py-2 border-b">Launched</th>
              <th className="text-left px-3 py-2 border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="odd:bg-muted/10">
                <td className="px-3 py-2 border-b">{c.name}</td>
                <td className="px-3 py-2 border-b">{c.sender_email}</td>
                <td className="px-3 py-2 border-b">{c.status}</td>
                <td className="px-3 py-2 border-b">{new Date(c.created_at).toLocaleString()}</td>
                <td className="px-3 py-2 border-b">{c.launched_at ? new Date(c.launched_at).toLocaleString() : "—"}</td>
                <td className="px-3 py-2 border-b">
                  <button
                    onClick={() => runBatch(c.id)}
                    disabled={loading}
                    className="px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {loading ? "Running…" : "Run 20 sends"}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No campaigns yet. Use the enqueue API to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
