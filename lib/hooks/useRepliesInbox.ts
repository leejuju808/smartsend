import { useEffect, useState } from "react";

export function useRepliesInbox(filters: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/replies/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error("Error loading replies:", error);
      setData({ ok: false, replies: [], total: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [JSON.stringify(filters)]);

  return { data, loading, reload: load };
}












