"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function CampaignScheduleForm({ campaignId, initial }: {
  campaignId: string;
  initial: {
    send_start?: string|null; send_end?: string|null;
    daily_window_start?: string|null; daily_window_end?: string|null;
    days_of_week?: number[]|null; rate_per_minute?: number|null;
    is_paused?: boolean|null;
  }
}) {
  const [sendStart, setSendStart] = React.useState(initial.send_start ?? "");
  const [sendEnd, setSendEnd] = React.useState(initial.send_end ?? "");
  const [winStart, setWinStart] = React.useState((initial.daily_window_start ?? "").slice(0,5));
  const [winEnd, setWinEnd] = React.useState((initial.daily_window_end ?? "").slice(0,5));
  const [days, setDays] = React.useState<number[]>(initial.days_of_week ?? [1,2,3,4,5]);
  const [rpm, setRpm] = React.useState(String(initial.rate_per_minute ?? 30));
  const [paused, setPaused] = React.useState(Boolean(initial.is_paused));

  const toggleDay = (d: number) => setDays(prev => prev.includes(d) ? prev.filter(x=>x!==d) : [...prev, d].sort());

  async function save() {
    if (winStart && winEnd && winStart >= winEnd) {
      toast.error("Daily window start must be before end.");
      return;
    }
    const payload = {
      send_start: sendStart || null,
      send_end: sendEnd || null,
      daily_window_start: winStart || null,
      daily_window_end: winEnd || null,
      days_of_week: days.length ? days : null,
      rate_per_minute: Math.max(1, parseInt(rpm||"30",10)),
      is_paused: paused
    };
    const res = await fetch(`/api/campaigns/${campaignId}/schedule`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json?.error ?? "Failed to save");
      return;
    }
    toast.success("Schedule saved");
  }

  return (
    <div className="space-y-4 rounded-2xl border p-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label>Send start (UTC ISO)</Label>
          <Input placeholder="2025-11-01T17:00:00Z" value={sendStart ?? ""} onChange={e=>setSendStart(e.target.value)} />
        </div>
        <div>
          <Label>Send end (UTC ISO)</Label>
          <Input placeholder="2025-11-30T23:59:59Z" value={sendEnd ?? ""} onChange={e=>setSendEnd(e.target.value)} />
        </div>
        <div>
          <Label>Daily window start (HH:MM)</Label>
          <Input type="time" value={winStart ?? ""} onChange={e=>setWinStart(e.target.value)} />
        </div>
        <div>
          <Label>Daily window end (HH:MM)</Label>
          <Input type="time" value={winEnd ?? ""} onChange={e=>setWinEnd(e.target.value)} />
        </div>
        <div>
          <Label>Rate per minute</Label>
          <Input type="number" min={1} value={rpm} onChange={e=>setRpm(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 mt-6">
          <Checkbox checked={paused} onCheckedChange={v=>setPaused(Boolean(v))} />
          <Label>Pause campaign</Label>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Days of week</Label>
        <div className="grid grid-cols-7 gap-2">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((name, i) => (
            <button
              key={i}
              type="button"
              onClick={()=>toggleDay(i)}
              className={`rounded-xl border p-2 text-sm ${days.includes(i) ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save}>Save schedule</Button>
      </div>
    </div>
  );
}


