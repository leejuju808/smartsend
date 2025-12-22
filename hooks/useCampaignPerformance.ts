// hooks/useCampaignPerformance.ts
import useSWR from "swr";

export interface CampaignPerformance {
  campaign_id: string;
  campaign_name: string;
  emails_sent: number;
  replies: number;
  bounces: number;
}

export function useCampaignPerformance() {
  const { data, error } = useSWR<CampaignPerformance[]>(
    "/api/dashboard/campaign-performance",
    (url) => fetch(url).then((r) => r.json())
  );

  return {
    campaigns: data || [],
    loading: !data && !error,
    error,
  };
}

