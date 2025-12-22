"use client";

import { useEffect, useState } from "react";

type Payload = {
  ready: boolean;
  checks?: Record<string, { ok: boolean; message?: string }>;
};

export function ReadyToSellBadge() {
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/sales-readiness", { cache: "no-store" });
        if (!res.ok) {
          // Not admin / not logged in / not available.
          if (alive) setReady(false);
          return;
        }
        const json = (await res.json()) as Payload;
        if (alive) setReady(!!json.ready);
      } catch {
        if (alive) setReady(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return null;

  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">
      READY TO SELL
    </span>
  );
}









