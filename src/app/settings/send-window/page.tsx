"use client";
import { useEffect, useState } from "react";

const DAYS = [
  { i:0, label:"Sun" }, { i:1, label:"Mon" }, { i:2, label:"Tue" },
  { i:3, label:"Wed" }, { i:4, label:"Thu" }, { i:5, label:"Fri" }, { i:6, label:"Sat" },
];

export default function SendWindowSettings() {
  const [tz, setTz] = useState("America/Los_Angeles");
  const [start, setStart] = useState(9);
  const [end, setEnd] = useState(17);
  const [weekdays, setWeekdays] = useState<number[]>([1,2,3,4,5]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings/send-window");
      const data = await res.json();
      if (data?.settings) {
        setTz(data.settings.timezone);
        setStart(data.settings.window_start);
        setEnd(data.settings.window_end);
        setWeekdays(data.settings.weekdays);
      }
    })();
  }, []);

  const toggle = (i: number) =>
    setWeekdays((w) => w.includes(i) ? w.filter(x => x !== i) : [...w, i].sort());

  const save = async () => {
    setSaving(true);
    await fetch("/api/settings/send-window", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: tz, window_start: start, window_end: end, weekdays }),
    });
    setSaving(false);
    alert("Saved.");
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Send Window</h1>

      <div className="border border-gray-800 rounded-2xl p-5 bg-gray-950 space-y-4">
        <div>
          <label className="text-sm text-gray-300">Timezone (IANA)</label>
          <input value={tz} onChange={e=>setTz(e.target.value)} className="w-full mt-1 px-3 py-2 rounded text-black" placeholder="America/New_York" />
          <p className="text-xs text-gray-500 mt-1">Examples: America/Los_Angeles, Europe/London</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-300">Start hour (0–23)</label>
            <input type="number" min={0} max={23} value={start} onChange={e=>setStart(Number(e.target.value))} className="w-full mt-1 px-3 py-2 rounded text-black" />
          </div>
          <div>
            <label className="text-sm text-gray-300">End hour (0–23)</label>
            <input type="number" min={0} max={23} value={end} onChange={e=>setEnd(Number(e.target.value))} className="w-full mt-1 px-3 py-2 rounded text-black" />
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-300">Allowed days</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {DAYS.map(d => (
              <button key={d.i}
                className={`px-3 py-1.5 rounded ${weekdays.includes(d.i) ? "bg-yellow-500 text-black" : "bg-gray-800"}`}
                onClick={() => toggle(d.i)}
              >{d.label}</button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">Set start=end=0 for 24/7 sending.</p>
        </div>

        <button onClick={save} disabled={saving} className="px-5 py-2 rounded bg-yellow-500 text-black font-semibold disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}