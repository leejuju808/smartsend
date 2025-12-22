"use client";

import { useEffect, useState } from "react";

type CampaignRevenueRow = {
  campaign_id: string;
  campaign_name: string;
  leads_generated: number;
  appointments: number;
  quotes_sent: number;
  jobs_won: number;
  revenue: number;
};

export function CampaignRevenueTable() {
  const [rows, setRows] = useState<CampaignRevenueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/campaigns/revenue")
      .then((r) => r.json())
      .then((data) => {
        setRows(data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading campaign revenue:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="text-xs text-gray-400">Loading revenue…</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
      <div className="text-sm font-semibold text-white">
        Campaign Revenue Attribution
      </div>

      <div className="text-[11px] text-gray-400">
        Which campaigns actually generated homeowners, appointments, and revenue.
      </div>

      <div className="grid grid-cols-6 text-[11px] font-semibold text-gray-400 border-b border-white/10 pb-1">
        <div>Campaign</div>
        <div>Leads</div>
        <div>Appts</div>
        <div>Quotes Sent</div>
        <div>Won Jobs</div>
        <div>Revenue</div>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.campaign_id}
            className="grid grid-cols-6 text-[11px] text-gray-200 bg-black/40 border border-white/10 p-2 rounded-lg"
          >
            <div className="font-medium">{row.campaign_name}</div>
            <div>{row.leads_generated}</div>
            <div>{row.appointments}</div>
            <div>{row.quotes_sent}</div>
            <div>{row.jobs_won}</div>
            <div className="text-yellow-300 font-semibold">
              ${Number(row.revenue).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="text-[11px] text-gray-500">No campaign revenue yet.</div>
      )}
    </div>
  );
}










































