import { useEffect, useState, useCallback } from "react";

export function useCampaignAnalytics(campaignId: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/analytics`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to load campaign analytics:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, refresh };
}

