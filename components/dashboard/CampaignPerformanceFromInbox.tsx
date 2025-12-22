// Block 20150 — Campaign Performance from Inbox

"use client";

import { useEffect, useState } from "react";

type CampaignStat = {
  campaign_id: string;
  campaign_name: string;
  total_leads: number;
  won_jobs: number;
  pipeline_estimated: number;
  revenue_closed: number;
};

export function CampaignPerformanceFromInbox() {
  const [rows, setRows] = useState<CampaignStat[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/inbox/campaign-summary");
      if (!res.ok) {
        throw new Error("Failed to load campaign summary");
      }
      const json = await res.json();
      setRows(json.campaigns ?? []);
    } catch (error) {
      console.error("Error loading campaign summary:", error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-4 bg-white rounded-xl border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">
          Campaigns → Jobs
        </h3>
        <button
          onClick={load}
          className="text-[11px] text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {rows.length === 0 && !loading && (
        <p className="text-[11px] text-gray-400">
          No campaigns with inbox leads yet.
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-1 text-xs">
          {rows.slice(0, 5).map((c) => (
            <div
              key={c.campaign_id}
              className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-gray-50"
            >
              <div>
                <p className="font-semibold text-gray-800">
                  {c.campaign_name}
                </p>
                <p className="text-[11px] text-gray-500">
                  Leads: {c.total_leads} · Won: {c.won_jobs} · Pipeline: $
                  {c.pipeline_estimated.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-gray-500">Revenue</p>
                <p className="font-semibold text-gray-900">
                  ${c.revenue_closed.toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

















































