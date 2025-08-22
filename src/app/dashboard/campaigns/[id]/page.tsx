"use client";
import { useEffect, useState } from "react";

export default function CampaignPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [sum, setSum] = useState<any>(null);
  const [auto, setAuto] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    const r = await fetch(`/api/campaigns/${id}/summary`);
    setSum(await r.json());
  }
  async function start() {
    await fetch(`/api/campaigns/${id}/start`, { method: "POST" });
    setRunning(true);
    await run();
  }
  async function pause() {
    await fetch(`/api/campaigns/${id}/pause`, { method: "POST" });
    setRunning(false);
  }
  async function run() {
    const r = await fetch(`/api/campaigns/${id}/run`, { method: "POST" });
    const j = await r.json();
    if (j?.done) setRunning(false);
    await load();
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => { if (sum?.status === "running") run(); }, 1200);
    return () => clearInterval(t);
  }, [auto, sum?.status]);

  const pct = sum?.total ? Math.round(((sum?.sent || 0) / sum.total) * 100) : 0;
  const opens = (sum?.opens ?? 0);
  const clicks = (sum?.clicks ?? 0);
  const openRate = sum?.total ? Math.round((opens / sum.total) * 100) : 0;
  const clickRate = sum?.total ? Math.round((clicks / sum.total) * 100) : 0;

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Campaign</h1>
      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">Status: <b>{sum?.status || "draft"}</b></div>
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)} /> Auto-run
          </label>
        </div>
        <div className="mt-2 text-sm">{sum?.sent || 0} / {sum?.total || 0} sent ({pct}%) • failed {sum?.failed || 0}</div>
        <div className="mt-2 h-2 w-full rounded-full bg-gray-100"><div className="h-2 bg-black rounded-full" style={{width:`${pct}%`}}/></div>
        <div className="mt-3 flex gap-2">
          <button onClick={start} className="rounded-xl bg-black px-4 py-2 text-white">Start</button>
          <button onClick={pause} className="rounded-xl border px-4 py-2">Pause</button>
          <button onClick={run} className="rounded-xl border px-4 py-2">Run batch</button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl border p-3">Opens: <b>{opens}</b> ({openRate}%)</div>
          <div className="rounded-xl border p-3">Clicks: <b>{clicks}</b> ({clickRate}%)</div>
          <div className="rounded-xl border p-3">Failed: <b>{sum?.failed || 0}</b></div>
        </div>
      </div>
    </div>
  );
}

