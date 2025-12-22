// Hook for fetching campaign analytics (client-side)

import { useState, useEffect } from "react";
import { CampaignAnalytics } from "./types";

export function useCampaignAnalytics(campaignId: string) {
  const [data, setData] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        setLoading(true);
        // Use the internal API route which handles auth via workspace context
        const response = await fetch(`/api/v1/campaigns/${campaignId}/analytics`);

        if (!response.ok) {
          throw new Error(`Failed to fetch analytics: ${response.statusText}`);
        }

        const result = await response.json();
        setData(result.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    if (campaignId) {
      fetchAnalytics();
    }
  }, [campaignId]);

  return { data, loading, error };
}

