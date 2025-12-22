// src/lib/hooks/useLoadedSegment.ts
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function useLoadedSegment() {
  const sp = useSearchParams();
  const [filter, setFilter] = useState<any>(null);

  useEffect(() => {
    const segInline = sp.get("segment");
    const segId = sp.get("segment_id");

    async function load() {
      if (segInline) {
        try { setFilter(JSON.parse(segInline)); } catch {}
      } else if (segId) {
        const r = await fetch(`/api/segments/${segId}`);
        const j = await r.json();
        if (j?.item?.definition) setFilter(j.item.definition);
      }
    }
    load();
  }, [sp]);

  return filter;
} 