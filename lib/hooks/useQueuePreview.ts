import { useEffect, useState } from "react";

export function useQueuePreview(campaignId: string, page = 1, pageSize = 50) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaignId) return;

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/queue-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page, pageSize }),
        });
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Failed to load queue preview:", err);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [campaignId, page, pageSize]);

  return { data, loading };
}












