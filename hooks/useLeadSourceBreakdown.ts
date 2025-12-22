// Block 15300 — Lead Source Breakdown Hook
import { useEffect, useState } from "react";
import { useCurrentWorkspace } from "./useCurrentWorkspace";

export interface LeadSourceCount {
  source: string;
  count: number;
}

export function useLeadSourceBreakdown() {
  const { workspace } = useCurrentWorkspace();
  const [breakdown, setBreakdown] = useState<LeadSourceCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspace?.id) return;

    async function fetchBreakdown() {
      try {
        const res = await fetch(`/api/contacts/lead-source-breakdown`);
        if (res.ok) {
          const data = await res.json();
          setBreakdown(data.breakdown || []);
        }
      } catch (err) {
        console.error("Failed to fetch lead source breakdown:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchBreakdown();
  }, [workspace?.id]);

  return { breakdown, loading };
}



























































