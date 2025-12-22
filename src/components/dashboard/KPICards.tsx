"use client";



import * as React from "react";

import { useEffect, useState } from "react";



type Metrics = {

  total: number;

  new: number;

  queued: number;

  sending: number;

  sent: number;

  failed: number;

  replied: number;

  sent_last_24h: number;

  reply_rate: number; // %

};



function Card({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {

  return (

    <div className="rounded-2xl border p-4 shadow-sm">

      <div className="text-xs text-muted-foreground">{label}</div>

      <div className="mt-1 text-2xl font-semibold">{value}</div>

      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}

    </div>

  );

}



export function KPICards({ campaignId }: { campaignId: string }) {

  const [m, setM] = useState<Metrics | null>(null);

  const [err, setErr] = useState<string | null>(null);



  async function load() {

    setErr(null);

    try {

      const res = await fetch(`/api/metrics/campaign?campaignId=${campaignId}`);

      const json = await res.json();

      if (!res.ok) throw new Error(json.error || "Failed to load metrics");

      setM(json.metrics);

    } catch (e: any) {

      setErr(e.message);

    }

  }



  useEffect(() => { if (campaignId) load(); /* eslint-disable-next-line */ }, [campaignId]);



  if (err) return <div className="text-sm text-red-600">Metrics error: {err}</div>;

  if (!m)  return <div className="text-sm text-muted-foreground">Loading metrics…</div>;



  return (

    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">

      <Card label="Total" value={m.total} />

      <Card label="New" value={m.new} />

      <Card label="Queued" value={m.queued} />

      <Card label="Sending" value={m.sending} />

      <Card label="Sent" value={m.sent} sub={`${m.sent_last_24h} in last 24h`} />

      <Card label="Failed" value={m.failed} />

      <Card label="Replied" value={m.replied} />

      <Card label="Reply Rate" value={`${m.reply_rate}%`} sub="(replied ÷ (sent+replied))" />

    </div>

  );

}

