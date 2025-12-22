"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast/ToastProvider";

type Stats = {
  total: number;
  counts: Record<string, number>;
  replyRate: number;
  bounceRate: number;
};

type LogRow = { id: string; event: string; detail: any; lead_id: string; created_at: string };

export default function CampaignOverview({ campaignId }: { campaignId: string }) {
  const { addToast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [event, setEvent] = useState<string>("all");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [fromEmail, setFromEmail] = useState("lead@example.com");
  const [subject, setSubject] = useState("Re: Quick question");
  const [body, setBody] = useState("Hey—interested. Can you send details?");

  const loadStats = async () => {
    const r = await fetch("/api/campaigns/stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId }) });
    const j = await r.json(); if (r.ok) setStats(j);
  };
  const loadLogs = async () => {
    const r = await fetch("/api/campaigns/logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId, event, limit: 200 }) });
    const j = await r.json(); if (r.ok) setLogs(j.rows);
  };

  useEffect(() => { loadStats(); loadLogs(); }, [campaignId, event]);

  const runWorker = async () => {
    const r = await fetch("/api/cron/send-worker");
    const j = await r.json();
    addToast({ title: "Worker run", description: `Processed: ${j.processed ?? 0}, sent: ${j.sent ?? 0}, failed: ${j.failed ?? 0}` });
    loadStats(); loadLogs();
  };

  const simulateReply = async () => {
    const r = await fetch("/api/test/inbound-email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId, from_email: fromEmail, subject, body_text: body })
    });
    const j = await r.json();
    addToast({ title: "Inbound test", description: `${j.status ?? "unknown"} (${j.ok ? "ok" : "fail"})` });
    loadStats(); loadLogs();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Campaign Overview</h1>
        <Link href={`/campaigns/${campaignId}/inbox`}>
          <Button variant="outline">Inbox</Button>
        </Link>
      </div>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi title="Total Leads" value={stats?.total ?? 0} />
        <Kpi title="Sent" value={stats?.counts?.sent ?? 0} />
        <Kpi title="Replied" value={stats?.counts?.replied ?? 0} />
        <Kpi title="Reply Rate" value={`${stats?.replyRate ?? 0}%`} />
      </div>

      {/* Test Bar */}
      <div className="border rounded-lg p-3 grid sm:grid-cols-2 gap-3">
        <div className="flex gap-2">
          <Button variant="outline" onClick={runWorker}>Run Worker</Button>
          <Select value={event} onValueChange={setEvent}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter logs" /></SelectTrigger>
            <SelectContent>
              {["all","queued","sending","sent","failed","replied","inbound_non_reply"].map(e => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Input placeholder="from_email" value={fromEmail} onChange={e=>setFromEmail(e.target.value)} />
          <Input placeholder="subject" value={subject} onChange={e=>setSubject(e.target.value)} />
          <Button onClick={simulateReply}>Simulate Reply</Button>
        </div>
      </div>

      {/* Logs */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-2 w-40">Time</th>
              <th className="text-left p-2">Event</th>
              <th className="text-left p-2">Lead</th>
              <th className="text-left p-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td className="p-3" colSpan={4}>No logs.</td></tr>
            ) : logs.map(l => (
              <tr key={l.id} className="border-t">
                <td className="p-2">{new Date(l.created_at).toLocaleString()}</td>
                <td className="p-2">
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">{l.event}</span>
                </td>
                <td className="p-2">{l.lead_id.slice(0,8)}…</td>
                <td className="p-2">
                  <pre className="text-xs whitespace-pre-wrap">{safeDetail(l.detail)}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
function safeDetail(detail: any) {
  try { return JSON.stringify(detail, null, 2); } catch { return String(detail); }
}
