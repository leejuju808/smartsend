"use client";

import { useEffect, useState } from "react";

export default function SendingPolicyCard({ accountId }: { accountId: string }) {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    timezone: "America/Los_Angeles",
    daily_cap: 150,
    hourly_cap: 20,
    warmup_enabled: true,
    warmup_day_1: 10,
    warmup_growth: 1,
    quiet_hours_start: 20,
    quiet_hours_end: 7,
    send_weekends: false,
  });

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/accounts/${accountId}/policy`);
      if (r.ok) setForm(await r.json());
      setLoading(false);
    })();
  }, [accountId]);

  async function save() {
    const r = await fetch(`/api/accounts/${accountId}/policy`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form)
    });
    if (!r.ok) alert(await r.text());
  }

  if (loading) return <div className="p-4 border rounded-xl">Loading…</div>;

  return (
    <div className="p-4 border rounded-2xl space-y-3">
      <div className="text-lg font-semibold">Sending Policy</div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Timezone
          <input className="mt-1 w-full border rounded-xl px-3 py-2"
            value={form.timezone} onChange={e=>setForm({...form, timezone:e.target.value})}/>
        </label>
        <label className="text-sm">Daily cap
          <input type="number" className="mt-1 w-full border rounded-xl px-3 py-2"
            value={form.daily_cap} onChange={e=>setForm({...form, daily_cap:+e.target.value})}/>
        </label>
        <label className="text-sm">Hourly cap
          <input type="number" className="mt-1 w-full border rounded-xl px-3 py-2"
            value={form.hourly_cap} onChange={e=>setForm({...form, hourly_cap:+e.target.value})}/>
        </label>
        <label className="text-sm">Warmup day 1
          <input type="number" className="mt-1 w-full border rounded-xl px-3 py-2"
            value={form.warmup_day_1} onChange={e=>setForm({...form, warmup_day_1:+e.target.value})}/>
        </label>
        <label className="text-sm">Warmup growth (+/day)
          <input type="number" className="mt-1 w-full border rounded-xl px-3 py-2"
            value={form.warmup_growth} onChange={e=>setForm({...form, warmup_growth:+e.target.value})}/>
        </label>
        <label className="text-sm">Quiet start (0–23)
          <input type="number" className="mt-1 w-full border rounded-xl px-3 py-2"
            value={form.quiet_hours_start} onChange={e=>setForm({...form, quiet_hours_start:+e.target.value})}/>
        </label>
        <label className="text-sm">Quiet end (0–23)
          <input type="number" className="mt-1 w-full border rounded-xl px-3 py-2"
            value={form.quiet_hours_end} onChange={e=>setForm({...form, quiet_hours_end:+e.target.value})}/>
        </label>
        <label className="text-sm flex items-center gap-2 mt-6">
          <input type="checkbox" checked={form.warmup_enabled} onChange={e=>setForm({...form, warmup_enabled:e.target.checked})}/>
          Enable warmup
        </label>
        <label className="text-sm flex items-center gap-2 mt-6">
          <input type="checkbox" checked={form.send_weekends} onChange={e=>setForm({...form, send_weekends:e.target.checked})}/>
          Send on weekends
        </label>
      </div>
      <div className="text-right">
        <button onClick={save} className="px-3 py-2 border rounded-xl">Save</button>
      </div>
    </div>
  );
}

