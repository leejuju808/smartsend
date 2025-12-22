// lib/hooks/useFollowupPreview.ts

import { useEffect, useState } from "react";

export function useFollowupPreview(campaignId: string) {
  const [data, setData] = useState<{ step1: number; nextSteps: number } | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!campaignId) return;
    setLoading(true);

    const load = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/followup-preview`);
        if (!res.ok) return;
        const json = await res.json();
        setData({
          step1: json.step1 ?? 0,
          nextSteps: json.nextSteps ?? 0,
        });
      } catch (e) {
        console.error("Follow-up preview error:", e);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [campaignId]);

  return { data, loading };
}












