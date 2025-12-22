"use client";

import { useEffect, useState } from "react";

interface VerificationCountersProps {
  campaignId: string;
}

interface Counts {
  valid: number;
  risky: number;
  invalid: number;
  unknown: number;
}

export function VerificationCounters({ campaignId }: VerificationCountersProps) {
  const [counts, setCounts] = useState<Counts>({ valid: 0, risky: 0, invalid: 0, unknown: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/verification-counts`);
        const data = await res.json();
        if (data.counts) {
          setCounts(data.counts);
        }
      } catch (err) {
        console.error("Failed to fetch verification counts:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCounts();
  }, [campaignId]);

  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border p-3 animate-pulse bg-gray-100 h-16" />
        ))}
      </div>
    );
  }

  const total = counts.valid + counts.risky + counts.invalid + counts.unknown;
  if (total === 0) return null;

  return (
    <div className="grid grid-cols-4 gap-2">
      <div className="rounded-lg border p-3">
        <div className="text-xs opacity-70">Valid</div>
        <div className="text-xl font-semibold text-green-600">{counts.valid}</div>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-xs opacity-70">Risky</div>
        <div className="text-xl font-semibold text-yellow-600">{counts.risky}</div>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-xs opacity-70">Invalid</div>
        <div className="text-xl font-semibold text-red-600">{counts.invalid}</div>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-xs opacity-70">Unknown</div>
        <div className="text-xl font-semibold text-gray-600">{counts.unknown}</div>
      </div>
    </div>
  );
}

