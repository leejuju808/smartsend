// lib/hooks/useFollowupTimeline.ts

import { useState, useEffect } from "react";

export function useFollowupTimeline(campaignId: string) {
  const [timeline, setTimeline] = useState<
    { step: number; send_at: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaignId) return;

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/campaigns/${campaignId}/followup-timeline`
        );
        if (!res.ok) return;
        const json = await res.json();
        setTimeline(json.timeline ?? []);
      } catch (e) {
        console.error("Follow-up timeline error:", e);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [campaignId]);

  return { timeline, loading };
}












