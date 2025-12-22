"use client";
import { useState } from "react";

const DOW = [
  { v:1, l:"Mon" },{ v:2, l:"Tue" },{ v:3, l:"Wed" },
  { v:4, l:"Thu" },{ v:5, l:"Fri" },{ v:6, l:"Sat" },{ v:7, l:"Sun" }
];

export default function SchedulerPanel({ workspaceId, onPreview }: { workspaceId: string; onPreview:(slots:string[])=>void }) {
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [windows, setWindows] = useState([{ dow:[1,2,3,4,5], start:"08:00", end:"11:00" }, { dow:[1,2,3,4,5], start:"14:00", end:"16:00" }]);
  const [perDay, setPerDay] = useState(40);
  const [gap, setGap] = useState(90);
  const [loading, setLoading] = useState(false);

  function updateWindow(i:number, patch:Partial<(typeof windows)[number]>) {
    setWindows(ws => ws.map((w,idx)=> idx===i ? { ...w, ...patch } : w));
  }

  async function preview() {
    setLoading(true);
    const res = await fetch("/api/scheduler/preview", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        workspaceId,
        plan: { timezone, windows, per_day: perDay, min_gap_seconds: gap },
        count: 30
      })
    });
    const json = await res.json();
    setLoading(false);
    onPreview(json.slots ?? []);
  }

  return (
    <div className="rounded-xl border p-4 space-y-4 bg-white">
      <h3 className="text-sm font-semibold">Send Scheduler</h3>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <div className="mb-1">Timezone</div>
          <input className="w-full border rounded-md px-2 py-1 text-sm" value={timezone} onChange={e=>setTimezone(e.target.value)} />
        </label>
        <label className="text-sm">
          <div className="mb-1">Sends per day</div>
          <input type="number" className="w-full border rounded-md px-2 py-1 text-sm" value={perDay} onChange={e=>setPerDay(Number(e.target.value))} />
        </label>
        <label className="text-sm">
          <div className="mb-1">Min gap (seconds)</div>
          <input type="number" className="w-full border rounded-md px-2 py-1 text-sm" value={gap} onChange={e=>setGap(Number(e.target.value))} />
        </label>
      </div>

      <div className="space-y-3">
        {windows.map((w,i)=>(
          <div key={i} className="flex items-center gap-2">
            <div className="flex gap-1">
              {DOW.map(d => (
                <button key={d.v}
                  onClick={()=> updateWindow(i, { dow: w.dow.includes(d.v) ? w.dow.filter(x=>x!==d.v) : [...w.dow, d.v] })}
                  className={`px-2 py-1 rounded border text-xs ${w.dow.includes(d.v) ? "bg-black text-white" : "bg-zinc-50"}`}>
                  {d.l}
                </button>
              ))}
            </div>
            <input value={w.start} onChange={e=>updateWindow(i,{ start:e.target.value })} className="border rounded px-2 py-1 text-sm w-24" />
            <span className="text-xs">to</span>
            <input value={w.end} onChange={e=>updateWindow(i,{ end:e.target.value })} className="border rounded px-2 py-1 text-sm w-24" />
            <button className="text-xs text-red-600 ml-2" onClick={()=> setWindows(ws=> ws.filter((_,idx)=> idx!==i))}>Remove</button>
          </div>
        ))}
        <button className="text-sm underline" onClick={()=> setWindows(ws=> [...ws, { dow:[1,2,3,4,5], start:"09:00", end:"12:00" }])}>
          + Add window
        </button>
      </div>

      <button onClick={preview} disabled={loading}
        className="w-full bg-black text-white rounded-md py-2 text-sm">
        {loading ? "Calculating…" : "Preview next 30 slots"}
      </button>
    </div>
  );
}
