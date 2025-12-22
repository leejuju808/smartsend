'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Loader2 } from "lucide-react";

type KpiSendActivity = { account_id: string; email_address: string; sends_today: number; due_now: number; };
type KpiBilling = { billing_account_id: string; plan_code: string; status: string; monthly_send_cap: number; sends_used: number; sends_left: number; current_period_start: string; current_period_end: string; };
type SenderHealth = { account_id: string; email_address: string; parallel_sends_limit: number; min_gap_seconds: number; domain_rate_per_min: number; jitter_max_seconds: number; last_sent_at: string | null; inflight: number; due_now: number; };
type Heartbeat = { worker: string; last_ok_at: string; meta: any; };
type Failure = { campaign_id: string; campaign: string; lead_id: string; email: string; step_no: number; error_message: string | null; created_at: string; };
type ReplyRow = { campaign_id: string; name: string; reply_rate_pct_7d: number | null; contacted_7d: number; replied_7d: number; };
type DelivRow = { campaign_id: string; name: string; bounces_7d: number | null; unsub_7d: number | null; };

export default function CommandBoard() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [sendKpis, setSendKpis] = useState<KpiSendActivity[]>([]);
  const [billing, setBilling] = useState<KpiBilling[]>([]);
  const [sender, setSender] = useState<SenderHealth[]>([]);
  const [hb, setHb] = useState<Heartbeat[]>([]);
  const [fails, setFails] = useState<Failure[]>([]);
  const [reply, setReply] = useState<ReplyRow[]>([]);
  const [deliv, setDeliv] = useState<DelivRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [
        a, b, c, d, e, f, g
      ] = await Promise.all([
        supabase.from('kpi_send_activity').select('*'),
        supabase.from('kpi_billing_overview').select('*'),
        supabase.from('kpi_sender_health').select('*'),
        supabase.from('kpi_heartbeats').select('*'),
        supabase.from('kpi_failures_24h').select('*').limit(20),
        supabase.from('kpi_reply_rate_7d').select('*'),
        supabase.from('kpi_deliverability_7d').select('*')
      ]);

      if (!a.error) setSendKpis(a.data as any);
      if (!b.error) setBilling(b.data as any);
      if (!c.error) setSender(c.data as any);
      if (!d.error) setHb(d.data as any);
      if (!e.error) setFails(e.data as any);
      if (!f.error) setReply(f.data as any);
      if (!g.error) setDeliv(g.data as any);
      setLoading(false);
    })();
  }, []);

  const totalSendsToday = sendKpis.reduce((acc, x) => acc + (x.sends_today || 0), 0);
  const totalDueNow = sendKpis.reduce((acc, x) => acc + (x.due_now || 0), 0);
  const avgReplyRate = reply.length ? Math.round(
    (reply.reduce((acc, x) => acc + (x.reply_rate_pct_7d || 0), 0) / reply.length) * 100
  ) / 100 : 0;
  const totalBounces = deliv.reduce((acc, x) => acc + (x.bounces_7d || 0), 0);
  const totalUnsubs = deliv.reduce((acc, x) => acc + (x.unsub_7d || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Command Board ⚡</h1>
        <div className="flex gap-2">
          <Button onClick={() => location.reload()}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Sends Today</div>
          <div className="text-2xl font-bold">{totalSendsToday}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Due Now</div>
          <div className="text-2xl font-bold">{totalDueNow}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Avg Reply Rate (7d)</div>
          <div className="text-2xl font-bold">{avgReplyRate}%</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Bounces (7d)</div>
          <div className="text-2xl font-bold">{totalBounces}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Unsubs (7d)</div>
          <div className="text-2xl font-bold">{totalUnsubs}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Plan Usage</div>
          <div className="text-2xl font-bold">
            {billing.length ? `${billing[0].sends_used}/${billing[0].monthly_send_cap}` : '—'}
          </div>
          <div className="text-xs text-muted-foreground">
            {billing.length ? `Left: ${billing[0].sends_left}` : ''}
          </div>
        </Card>
      </div>

      {/* Sender health */}
      <Card className="p-4">
        <div className="text-sm font-medium mb-2">Sender Health</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sender.map((s) => (
            <div key={s.account_id} className="rounded-xl border p-3">
              <div className="font-medium">{s.email_address}</div>
              <div className="text-xs text-muted-foreground">In-flight: {s.inflight} · Due now: {s.due_now}</div>
              <div className="text-xs">Parallel: {s.parallel_sends_limit} · Min gap: {s.min_gap_seconds}s · Domain/min: {s.domain_rate_per_min}</div>
              <div className="text-xs">Jitter max: {s.jitter_max_seconds}s</div>
              <div className="text-xs text-muted-foreground">Last sent: {s.last_sent_at ? new Date(s.last_sent_at).toLocaleString() : '—'}</div>
            </div>
          ))}
          {!sender.length && <div className="text-sm text-muted-foreground">No connected accounts yet.</div>}
        </div>
      </Card>

      {/* Heartbeat + Failures */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 col-span-1">
          <div className="text-sm font-medium mb-2">Worker Heartbeat</div>
          {hb.map(h => (
            <div key={h.worker} className="flex items-center justify-between border rounded-lg px-3 py-2 mb-2">
              <div>
                <div className="font-medium">{h.worker}</div>
                <div className="text-xs text-muted-foreground">Last OK: {new Date(h.last_ok_at).toLocaleString()}</div>
              </div>
              <div className="text-xs text-muted-foreground">{h.meta?.processed ?? 0} processed</div>
            </div>
          ))}
          {!hb.length && <div className="text-sm text-muted-foreground">No heartbeats recorded yet.</div>}
        </Card>

        <Card className="p-4 col-span-2">
          <div className="text-sm font-medium mb-2">Failures (24h)</div>
          <div className="space-y-2 max-h-80 overflow-auto">
            {fails.map(f => (
              <div key={f.campaign_id + f.lead_id + f.created_at} className="border rounded-lg p-3">
                <div className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString()}</div>
                <div className="font-medium">{f.campaign} — Step {f.step_no} → {f.email}</div>
                <div className="text-sm">{f.error_message || 'No error message'}</div>
              </div>
            ))}
            {!fails.length && <div className="text-sm text-muted-foreground">No failures in the last 24 hours.</div>}
          </div>
        </Card>
      </div>

      {/* Reply & Deliverability tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Reply Rate (7d)</div>
          <div className="space-y-2 max-h-80 overflow-auto">
            {reply.map(r => (
              <div key={r.campaign_id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                <div className="font-medium">{r.name}</div>
                <div className="text-sm">{r.reply_rate_pct_7d ?? 0}%</div>
              </div>
            ))}
            {!reply.length && <div className="text-sm text-muted-foreground">No recent reply data.</div>}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Deliverability (7d)</div>
          <div className="space-y-2 max-h-80 overflow-auto">
            {deliv.map(d => (
              <div key={d.campaign_id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                <div className="font-medium">{d.name}</div>
                <div className="text-xs text-muted-foreground">Bounces: {d.bounces_7d ?? 0} · Unsubs: {d.unsub_7d ?? 0}</div>
              </div>
            ))}
            {!deliv.length && <div className="text-sm text-muted-foreground">No deliverability data yet.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

