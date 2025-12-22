"use client";

import useSWR from "swr";
import { KPICard } from "@/app/dashboard/components/KPICard";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CampaignKPIs({ campaignId }: { campaignId: string }) {
  const { data, isLoading, error } = useSWR(
    `/api/campaigns/${campaignId}/stats`,
    fetcher,
    { refreshInterval: 15000 }
  );

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard label="Loading..." value="—" />
        <KPICard label="Loading..." value="—" />
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const kpis = data.kpis || {};
  const open_rate = kpis.open_rate ?? 0;
  const click_rate = kpis.click_rate ?? 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard label="Open Rate" value={`${open_rate}%`} />
      <KPICard label="Click Rate" value={`${click_rate}%`} />
    </div>
  );
}

