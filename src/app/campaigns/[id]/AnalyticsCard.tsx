"use client";
import { useEffect, useState } from "react";

type CA = {
  sent: number; unique_opens: number; unique_clicks: number; replies: number;
  open_rate_pct: number; click_rate_pct: number; reply_rate_pct: number;
  first_sent_at: string | null; last_sent_at: string | null;
};

export default function CampaignAnalyticsCard({ id }: { id: string }) {
  const [data, setData] = useState<CA | null>(null);

  useEffect(() => {
    fetch(`/api/analytics/campaigns/${id}`).then(r => r.json()).then(j => setData(j.analytics || null));
  }, [id]);

  if (!data) return null;

  return (
    <div className="rounded-2xl border p-4">
      <h3 className="font-medium">Campaign Performance</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-sm text-gray-500">Sent</div>
          <div className="text-xl font-semibold">{data.sent}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Open / Click / Reply</div>
          <div className="text-xl font-semibold">
            {data.open_rate_pct}% / {data.click_rate_pct}% / {data.reply_rate_pct}%
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Last Activity</div>
          <div className="text-xl font-semibold">
            {data.last_sent_at ? new Date(data.last_sent_at).toLocaleDateString() : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}