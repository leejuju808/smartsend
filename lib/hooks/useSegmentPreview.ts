// lib/hooks/useSegmentPreview.ts

import { useEffect, useState } from "react";
import type { SegmentRuleNode } from "@/lib/segments/debug";

export function useSegmentPreview(accountId: string, rules: SegmentRuleNode | null) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accountId) {
      setCount(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);

      try {
        const res = await fetch("/api/segments/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, rules }),
        });

        if (!res.ok) {
          setCount(null);
          return;
        }

        const json = await res.json();
        setCount(json.matchedCount ?? 0);
      } catch (e) {
        console.error("Segment preview error:", e);
        setCount(null);
      } finally {
        setLoading(false);
      }
    }, 350); // debounce

    return () => clearTimeout(timer);
  }, [accountId, JSON.stringify(rules)]);

  return { count, loading };
}












