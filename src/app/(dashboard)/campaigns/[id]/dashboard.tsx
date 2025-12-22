"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { RoleBadge } from "@/components/RoleBadge";
import { VerificationCounters } from "@/components/campaign/VerificationCounters";
import { DeliverabilityWarningBanner } from "@/components/deliverability/DeliverabilityWarningBanner";
import { fetchCampaignReplies } from "@/lib/queries/replies";
import StepFunnel, { StepFunnelRow } from "./components/StepFunnel";

export default function CampaignDashboard({ id, funnelRows }: { id: string; funnelRows: StepFunnelRow[] }) {
  const [kpis, setKpis] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [abStats, setAbStats] = useState<any[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [replyCounts, setReplyCounts] = useState<{ replied_count: number; total: number } | null>(null);

  useEffect(() => {
    (async () => {
      const s = await fetch(`/api/campaigns/${id}/stats`).then(r=>r.json());
      const t = await fetch(`/api/campaigns/${id}/timeseries`).then(r=>r.json());
      const e = await fetch(`/api/campaigns/${id}/errors`).then(r=>r.json());
      const ab = await fetch(`/api/campaigns/${id}/ab-stats`).then(r=>r.json()).catch(() => ({ stats: [] }));
      setKpis(s.kpis); setSeries(t.rows||[]); setErrors(e.rows||[]); setAbStats(ab.stats||[]);
      
      // Fetch reply counts
      try {
        const replies = await fetchCampaignReplies(id);
        setReplyCounts(replies);
      } catch (err) {
        console.error("Error fetching reply counts:", err);
      }
      
      // Fetch teamId from campaign
      const camp = await fetch(`/api/campaigns/${id}`).then(r=>r.json()).catch(() => null);
      if (camp?.team_id) setTeamId(camp.team_id);
    })();
  }, [id]);

  if (!kpis) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campaign Dashboard</h1>
        <div className="flex items-center gap-3">
          {replyCounts && (
            <div className="text-sm px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
              Replies: {replyCounts.replied_count} / {replyCounts.total}
            </div>
          )}
          <Link
            href={`/campaigns/${id}/queue`}
            className="text-sm underline underline-offset-2"
          >
            Queue
          </Link>
          <RoleBadge campaignId={id} />
        </div>
      </div>
      
      {teamId && <DeliverabilityWarningBanner campaignId={id} teamId={teamId} />}
      
      <div className="grid grid-cols-6 gap-4">
        {[
          { label: "In Queue", value: kpis.in_queue },
          { label: "Sent", value: kpis.sent },
          { label: "Replied", value: kpis.replied },
          { label: "Reply Rate", value: `${kpis.reply_rate_pct}%` },
          { label: "Bounced", value: kpis.bounced },
          { label: "Cap Remaining (today)", value: kpis.cap_remaining }
        ].map((c, i)=>(
          <div key={i} className="rounded-2xl border p-4">
            <div className="text-xs opacity-70">{c.label}</div>
            <div className="text-2xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>

      <StepFunnel rows={funnelRows} />

      {/* Verification Counters */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Email Verification</h2>
        <VerificationCounters campaignId={id} />
      </div>

      <div className="rounded-2xl border p-4">
        <div className="text-sm font-medium mb-2">14-Day Trend (Sent vs. Cumulative Replies)</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="day" 
                tick={{ fontSize: 12 }} 
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                labelFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString();
                }}
              />
              <Line type="monotone" dataKey="sent" stroke="#8884d8" name="Sent" />
              <Line type="monotone" dataKey="cumulative_replied" stroke="#82ca9d" name="Cumulative Replies" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* A/B Testing Stats */}
      {abStats.length > 0 && (
        <div className="rounded-2xl border p-4">
          <div className="text-sm font-medium mb-4">A/B Testing Results</div>
          <div className="grid grid-cols-2 gap-4">
            {abStats.map((stat: any) => {
              const otherStat = abStats.find((s: any) => s.variant_key !== stat.variant_key);
              const diff = otherStat 
                ? ((stat.reply_rate_pct - otherStat.reply_rate_pct)).toFixed(1)
                : "0.0";
              const isLeader = otherStat && stat.reply_rate_pct > otherStat.reply_rate_pct;
              
              return (
                <div key={stat.variant_key} className="rounded-xl border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold">Variant {stat.variant_key}</span>
                    {isLeader && stat.sends >= 20 && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Leader</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="opacity-70">Sends</div>
                      <div className="font-semibold">{stat.sends}</div>
                    </div>
                    <div>
                      <div className="opacity-70">Replies</div>
                      <div className="font-semibold">{stat.replies}</div>
                    </div>
                    <div>
                      <div className="opacity-70">Rate</div>
                      <div className="font-semibold">{stat.reply_rate_pct}%</div>
                    </div>
                  </div>
                  {otherStat && (
                    <div className="text-xs opacity-60 pt-2 border-t">
                      {parseFloat(diff) > 0 ? "+" : ""}{diff}% vs Variant {otherStat.variant_key}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Recent Send Errors</div>
          <a href={`/campaigns/${id}/queue`} className="text-sm underline">Open Send Queue</a>
        </div>
        {errors.length === 0 ? (
          <div className="text-sm opacity-70">No errors 🎉</div>
        ) : (
          <div className="text-sm grid grid-cols-1 gap-2">
            {errors.map((e:any)=>(
              <div key={e.lead_id} className="rounded-xl border p-3">
                <div className="font-medium">Lead: {e.lead_id}</div>
                <div className="opacity-70">{e.last_error}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

