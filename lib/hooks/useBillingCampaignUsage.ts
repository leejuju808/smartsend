"use client";

import { useCallback, useEffect, useState } from "react";

export type CampaignUsageRow = {
  campaign_id: string;
  name: string;
  sends_30d: number;
  replies_30d: number;
};

export type CampaignUsageResponse = {
  campaigns: CampaignUsageRow[];
};

export function useBillingCampaignUsage(limit: number = 20) {
  const [data, setData] = useState<CampaignUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/billing/campaign-usage?limit=${limit}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}





