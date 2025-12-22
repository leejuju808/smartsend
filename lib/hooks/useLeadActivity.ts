import { useEffect, useState } from "react";

export function useLeadActivity(leadId: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/activity`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (leadId) void load();
  }, [leadId]);

  return { data, loading, reload: load };
}












