"use client";

import { useEffect, useState } from "react";

export function WarmupProgress({ account }: { account: any }) {
  const [cap, setCap] = useState<number>(0);

  useEffect(() => {
    if (!account?.id) return;
    fetch(`/api/mailboxes/today-cap?account_id=${account.id}`)
      .then(r => r.json())
      .then(d => setCap(d.cap ?? 0))
      .catch(() => setCap(0));
  }, [account?.id]);

  const warmupDay = account?.warmup_day ?? 1;
  const pct = Math.min(100, Math.round((warmupDay / 30) * 100));

  return (
    <div className="text-sm">
      <div className="flex justify-between mb-1">
        <span>Warmup day {warmupDay}</span>
        <span>{cap}/day</span>
      </div>
      <div className="h-2 w-full bg-neutral-200 rounded">
        <div className="h-2 rounded bg-blue-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}


