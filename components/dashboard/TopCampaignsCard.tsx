"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  status: string;
  sent: number;
  replies: number;
  hot: number;
  replyRate: number;
}

export function TopCampaignsCard() {
  const [data, setData] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard/campaigns");
        const json = await res.json();
        if (res.ok) {
          setData(json.campaigns || []);
        }
      } catch (error) {
        console.error("Failed to load top campaigns:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="border rounded-2xl p-4 bg-white">
      <div className="text-xs font-semibold mb-2">Top campaigns (30 days)</div>
      {loading && (
        <div className="text-[11px] text-gray-500">Loading…</div>
      )}
      {!loading && data.length === 0 && (
        <div className="text-[11px] text-gray-500">
          No campaign activity yet.
        </div>
      )}
      {!loading && data.length > 0 && (
        <div className="space-y-1 text-[11px]">
          {data.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="flex items-center justify-between hover:bg-slate-50 rounded p-1 -mx-1 transition-colors"
            >
              <div className="truncate max-w-[60%]">
                {c.name || "Untitled"}
              </div>
              <div className="text-gray-500">
                {c.hot} hot · {Math.round(c.replyRate * 100)}% replies
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}



























































