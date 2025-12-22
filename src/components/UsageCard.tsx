"use client";
import { useEffect, useState } from "react";

type Usage = { month: number; limit: number; ratePerMin: number; };
export default function UsageCard() {
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/usage");
      if (res.ok) setU(await res.json());
    })();
  }, []);
  if (!u) return <div className="border rounded-xl p-4">Loading usage…</div>;

  const pct = Math.min(100, Math.round((u.month / u.limit) * 100));
  return (
    <div className="border rounded-xl p-4">
      <div className="flex justify-between mb-2">
        <h3 className="font-semibold">Usage this month</h3>
        <span className="text-sm text-gray-600">{u.month} / {u.limit}</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded">
        <div className="h-2 rounded" style={{ width: `${pct}%`, background: "black" }} />
      </div>
      <div className="mt-3 text-sm text-gray-600">Rate limit: {u.ratePerMin}/min</div>
    </div>
  );
}