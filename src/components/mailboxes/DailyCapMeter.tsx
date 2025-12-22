"use client";

import { useEffect, useState } from "react";

export function DailyCapMeter({ accountId, dailyCap }: { accountId: string; dailyCap: number }) {
  const [used, setUsed] = useState(0);

  useEffect(() => {
    fetch(`/api/mailboxes/usage-today?account_id=${accountId}`)
      .then(r => r.json())
      .then(d => setUsed(d.sent_count ?? 0))
      .catch(() => setUsed(0));
  }, [accountId]);

  const pct = Math.min(100, Math.round((used / Math.max(dailyCap, 1)) * 100));

  return (
    <div className="text-sm">
      <div className="flex justify-between mb-1">
        <span>Daily cap</span>
        <span>{used}/{dailyCap}</span>
      </div>
      <div className="h-2 w-full bg-neutral-200 rounded">
        <div className="h-2 rounded bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      {used >= dailyCap && (
        <div className="mt-2 text-xs text-amber-700">
          Reached cap — remaining sends will auto-defer to tomorrow 9:00.
        </div>
      )}
    </div>
  );
}




