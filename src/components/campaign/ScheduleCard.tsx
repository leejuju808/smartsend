"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AvatarStack } from "@/components/team/AvatarStack";
import { BuildQueueButton } from "./BuildQueueButton";

type Schedule = {
  id: string;
  tz: string;
  send_start: string; // "09:00:00+00" ok
  send_end: string;
  days_of_week: number[];
  daily_cap_override: number | null;
  min_delay_minutes: number;
};

const DOW = [
  { v:0, l:"Sun" },{ v:1, l:"Mon" },{ v:2, l:"Tue" },
  { v:3, l:"Wed" },{ v:4, l:"Thu" },{ v:5, l:"Fri" },{ v:6, l:"Sat" },
];

export function ScheduleCard({ campaignId, role }:{ campaignId:string; role: "owner"|"editor"|"viewer"|null }) {
  const readOnly = role !== "owner";
  const [sched, setSched] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sim, setSim] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await fetch(`/api/campaigns/${campaignId}/schedule`);
      const j = await r.json();
      setSched(j.schedule);
      setLoading(false);
    })();
  }, [campaignId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/campaign/${campaignId}/team`);
        const payload = await response.json();
        if (!cancelled) {
          setTeam(Array.isArray(payload?.team) ? payload.team : []);
        }
      } catch {
        if (!cancelled) {
          setTeam([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  function toggleDay(v:number) {
    if (!sched) return;
    const set = new Set(sched.days_of_week || []);
    set.has(v) ? set.delete(v) : set.add(v);
    setSched({ ...sched, days_of_week: Array.from(set).sort((a,b)=>a-b) });
  }

  async function save() {
    if (!sched) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/schedule`, {
        method:"PATCH",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify({
          tz: sched.tz,
          send_start: sched.send_start,
          send_end: sched.send_end,
          days_of_week: sched.days_of_week,
          daily_cap_override: sched.daily_cap_override,
          min_delay_minutes: sched.min_delay_minutes
        })
      });
      const j = await r.json();
      if (!r.ok) alert(j.error || "Save failed");
    } finally { setSaving(false); }
  }

  async function simulate() {
    const r = await fetch(`/api/campaigns/${campaignId}/simulate`);
    const j = await r.json();
    setSim(j.sim);
  }

  if (loading || !sched) return <Card className="p-4">Loading schedule…</Card>;

  return (
    <Card className="space-y-3 rounded-2xl p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold">Send Schedule</div>
          <div className="text-xs text-muted-foreground">Shared with team</div>
        </div>
        <AvatarStack team={team} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="grid gap-2">
          <label className="text-xs">Timezone</label>
          <Input value={sched.tz} onChange={e=>setSched({ ...sched, tz: e.target.value })} disabled={readOnly}/>
        </div>
        <div className="grid gap-2">
          <label className="text-xs">Daily Cap (override)</label>
          <Input type="number" placeholder="(use mailbox cap)" value={sched.daily_cap_override ?? ""} onChange={e=>{
            const v = e.target.value === "" ? null : Number(e.target.value);
            setSched({ ...sched, daily_cap_override: v as any });
          }} disabled={readOnly}/>
        </div>
        <div className="grid gap-2">
          <label className="text-xs">Send Window Start (HH:MM)</label>
          <Input placeholder="09:00" value={sched.send_start ? sched.send_start.slice(0,5) : ""} onChange={e=>{
            const timeStr = e.target.value;
            // Format as time with time zone: HH:MM:SS+TZ
            setSched({ ...sched, send_start: timeStr.length === 5 ? `${timeStr}:00+00` : timeStr });
          }} disabled={readOnly}/>
        </div>
        <div className="grid gap-2">
          <label className="text-xs">Send Window End (HH:MM)</label>
          <Input placeholder="17:00" value={sched.send_end ? sched.send_end.slice(0,5) : ""} onChange={e=>{
            const timeStr = e.target.value;
            // Format as time with time zone: HH:MM:SS+TZ
            setSched({ ...sched, send_end: timeStr.length === 5 ? `${timeStr}:00+00` : timeStr });
          }} disabled={readOnly}/>
        </div>
        <div className="grid gap-2">
          <label className="text-xs">Min Delay Between Sends (minutes)</label>
          <Input type="number" value={sched.min_delay_minutes} onChange={e=>{
            setSched({ ...sched, min_delay_minutes: Number(e.target.value || 1) });
          }} disabled={readOnly}/>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {DOW.map(d => {
          const active = (sched.days_of_week || []).includes(d.v);
          return (
            <button
              key={d.v}
              className={`px-2 py-1 rounded border text-xs ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              onClick={()=>!readOnly && toggleDay(d.v)}
              disabled={readOnly}
            >{d.l}</button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={readOnly || saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button variant="secondary" onClick={simulate}>Simulate tomorrow</Button>
      </div>

      <div className="flex items-center gap-2">
        <BuildQueueButton campaignId={campaignId} defaultDate="today" />
        <BuildQueueButton campaignId={campaignId} defaultDate="tomorrow" />
      </div>

      {sim && (
        <div className="text-xs mt-2 p-3 rounded border bg-gray-50">
          <div><b>{sim.date}</b> · Window: {sim.window_start || '—'} → {sim.window_end || '—'} ({sim.tz})</div>
          <div>Cap: <b>{sim.effective_cap}</b> · Eligible: <b>{sim.eligible_leads}</b> · Will enqueue: <b>{sim.will_enqueue}</b> · Min delay: {sim.min_delay_minutes}m</div>
          {sim.window_start === null && <div className="text-red-600">Tomorrow is outside your active days.</div>}
        </div>
      )}
    </Card>
  );
}

