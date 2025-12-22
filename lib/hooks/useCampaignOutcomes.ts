"use client";

import { useCallback, useEffect, useState } from "react";

export type CampaignOutcome = {
  campaign_id: string;
  total_sent: number;
  total_replies: number;
  total_meetings: number;
  closed_won_value_cents: number;
};

type ResponseShape = {
  outcomes: CampaignOutcome[];
};

export function useCampaignOutcomes() {
  const [data, setData] = useState<CampaignOutcome[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns/outcomes");
      const json: ResponseShape = await res.json();
      if (res.ok && Array.isArray(json.outcomes)) {
        setData(json.outcomes);
      } else {
        setData([]);
      }
    } catch (err) {
      console.error("useCampaignOutcomes error", err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { outcomes: data, loading, reload: load };
}





