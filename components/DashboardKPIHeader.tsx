"use client";

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

function KPICard({ label, value, sub }: { label: string; value: string | number; sub?: string }){
  return (
    <div className="rounded-xl border p-4 bg-background">
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-1">{sub}</div>}
    </div>
  );
}

export default function DashboardKPIHeader({ campaignId }: { campaignId?: string }){
  const [tf, setTf] = useState<'today'|'7d'|'30d'>('today');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ leadsImported: number; inQueue: number; sent: number; replies: number; failRate: number } | null>(null);

  async function load(t: 'today'|'7d'|'30d' = tf){
    setLoading(true);
    try{
      const sp = new URLSearchParams({ tf: t });
      if (campaignId) sp.set('campaignId', campaignId);
      const r = await fetch(`/api/kpis?${sp.toString()}`);
      const j = await r.json();
      setData(j.metrics);
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ load('today'); }, [campaignId]);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">Key Metrics</div>
        <div className="flex gap-2">
          <Button size="sm" variant={tf==='today'?'default':'outline'} onClick={()=>{setTf('today'); load('today');}}>Today</Button>
          <Button size="sm" variant={tf==='7d'?'default':'outline'} onClick={()=>{setTf('7d'); load('7d');}}>7d</Button>
          <Button size="sm" variant={tf==='30d'?'default':'outline'} onClick={()=>{setTf('30d'); load('30d');}}>30d</Button>
        </div>
      </div>

      {loading && <div className="text-sm">Loading…</div>}

      {!loading && data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPICard label="Leads Imported" value={data.leadsImported} />
          <KPICard label="In Queue" value={data.inQueue} />
          <KPICard label="Sent" value={data.sent} />
          <KPICard label="Replies" value={data.replies} />
          <KPICard label="Fail Rate" value={`${data.failRate}%`} sub={data.sent>0?`${data.replies} replies / ${data.sent} sent`:'—'} />
        </div>
      )}
    </div>
  );
}


