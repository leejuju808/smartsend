import { useEffect, useState } from "react";

export function useCampaignAudience(campaignId: string) {
  const [audience, setAudience] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/audience`);
        if (!res.ok) return setAudience(null);
        const json = await res.json();
        if (!ignore) {
          setAudience(json.audience ?? 0);
        }
      } catch (e) {
        if (!ignore) setAudience(null);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    void load();
    return () => {
      ignore = true;
    };
  }, [campaignId]);

  return { audience, loading };
}












