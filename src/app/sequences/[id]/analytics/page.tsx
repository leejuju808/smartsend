"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";

const fetcher=(u:string)=>fetch(u).then(r=>r.json());

export default function SequenceAnalytics({ params }:{ params:{ id:string }}) {
  const { data, mutate } = useSWR(`/api/sequences/${params.id}/analytics`, fetcher, { refreshInterval: 15000 });
  const { data: steps } = useSWR(`/api/sequences/${params.id}/steps`, fetcher);
  const { data: settings } = useSWR(`/api/sequences/${params.id}/steps`, fetcher); // piggybacks sequence object

  const funnel = data?.funnel ?? [];
  const tto = data?.timeToOpen ?? [];
  const totals = Object.fromEntries((data?.totals ?? []).map((r:any)=>[r.status, r.count]));

  const [toggles, setToggles] = useState<any>(null);
  if (steps?.sequence && !toggles) setTimeout(()=>setToggles({
    exit_on_unsubscribe: steps.sequence.exit_on_unsubscribe ?? true,
    exit_on_reply: steps.sequence.exit_on_reply ?? true,
    exit_on_bounce: steps.sequence.exit_on_bounce ?? true,
    goal_on_click: steps.sequence.goal_on_click ?? false,
    goal_on_open: steps.sequence.goal_on_open ?? false
  }),0);

  async function saveToggles(){
    const res = await fetch(`/api/sequences/${params.id}/settings`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toggles)
    });
    const j = await res.json(); if(!res.ok||!j.ok) return alert(j.error||"Save failed");
    mutate();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sequence Analytics</h1>
        <Link className="underline text-sm" href={`/sequences/${params.id}`}>Back to Builder</Link>
      </div>

      {/* Settings */}
      {toggles && (
        <div className="border rounded-xl p-4 grid gap-2 max-w-3xl">
          <div className="text-sm font-medium mb-1">Exit & Goal Settings</div>
          <div className="grid md:grid-cols-3 gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={toggles.exit_on_unsubscribe} onChange={e=>setToggles({...toggles, exit_on_unsubscribe:e.target.checked})}/> Exit on Unsubscribe</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={toggles.exit_on_reply} onChange={e=>setToggles({...toggles, exit_on_reply:e.target.checked})}/> Exit on Reply</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={toggles.exit_on_bounce} onChange={e=>setToggles({...toggles, exit_on_bounce:e.target.checked})}/> Exit on Bounce</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={toggles.goal_on_open} onChange={e=>setToggles({...toggles, goal_on_open:e.target.checked})}/> Goal on Open</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={toggles.goal_on_click} onChange={e=>setToggles({...toggles, goal_on_click:e.target.checked})}/> Goal on Click</label>
          </div>
          <button className="border rounded px-3 py-1 w-fit mt-2" onClick={saveToggles}>Save</button>
        </div>
      )}

      {/* Totals */}
      <div className="border rounded-xl p-4">
        <div className="text-sm">Enrollments — Active: {totals.active ?? 0} • Paused: {totals.paused ?? 0} • Completed: {totals.completed ?? 0} • Stopped: {totals.stopped ?? 0}</div>
      </div>

      {/* Step Funnel */}
      <div className="border rounded-xl p-4">
        <h2 className="text-lg font-medium mb-2">Per-Step Funnel (last 90 days)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left">
              <th className="py-2 pr-3">Step</th>
              <th className="py-2 pr-3">Sent</th>
              <th className="py-2 pr-3">Delivered</th>
              <th className="py-2 pr-3">Bounced</th>
              <th className="py-2 pr-3">Opens</th>
              <th className="py-2 pr-3">Clicks</th>
              <th className="py-2 pr-3">Median TTO (min)</th>
            </tr></thead>
            <tbody>
              {funnel.map((r:any)=>{
                const t = (tto.find((x:any)=>x.position===r.position)?.median_minutes_to_open ?? null);
                return (
                  <tr key={r.position} className="border-t">
                    <td className="py-2 pr-3">{r.position}</td>
                    <td className="py-2 pr-3">{r.sent}</td>
                    <td className="py-2 pr-3">{r.delivered}</td>
                    <td className="py-2 pr-3">{r.bounced}</td>
                    <td className="py-2 pr-3">{r.opens}</td>
                    <td className="py-2 pr-3">{r.clicks}</td>
                    <td className="py-2 pr-3">{t ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}