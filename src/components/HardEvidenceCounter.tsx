"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type HardEvidencePayload = {
  period: { month_start: string };
  top: {
    jobs_closed_this_month: number;
    estimated_revenue_won_this_month: number;
  };
};

function formatMoney(n: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n || 0);
  } catch {
    return `$${Math.round(n || 0).toLocaleString()}`;
  }
}

export function HardEvidenceCounter() {
  const [data, setData] = useState<HardEvidencePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/hard-evidence", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as HardEvidencePayload | null;
        if (!cancelled) setData(json);
      } catch {
        // ignore
      }
    };

    run();
    const id = setInterval(run, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const monthLabel = useMemo(() => {
    const iso = data?.period?.month_start;
    if (!iso) return "This month";
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short" });
  }, [data?.period?.month_start]);

  const jobs = data?.top?.jobs_closed_this_month ?? 0;
  const rev = data?.top?.estimated_revenue_won_this_month ?? 0;

  return (
    <Link
      href="/dashboard/proof"
      className="hidden md:flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"
      title="Open SmartSend Proof"
    >
      <span className="text-gray-500">{monthLabel}:</span>
      <span>{jobs.toLocaleString()} jobs</span>
      <span className="text-gray-400">•</span>
      <span>{formatMoney(rev)}</span>
    </Link>
  );
}



