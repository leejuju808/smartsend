"use client";

import { useEffect, useMemo, useState } from "react";

type ProofOfDominancePayload = {
  as_of: string;
  top_line: {
    smartsend_jobs_mtd: number;
    smartsend_revenue_mtd: number;
  };
  comparison: {
    week_start: string;
    smartsend_jobs_week: number;
    other_jobs_week: number;
    show: boolean;
  };
  efficiency: {
    smartsend_cost_mtd: number;
    spend_per_dollar_earned: number | null;
  };
};

function formatMoney0(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

function formatMoney2(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export function ProofOfDominanceTopLine() {
  const [data, setData] = useState<ProofOfDominancePayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch("/api/proof-of-dominance", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as ProofOfDominancePayload | null;
        if (!cancelled) setData(json);
      } catch {
        // ignore
      }
    };

    run();
    const t = setInterval(run, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const jobs = data?.top_line?.smartsend_jobs_mtd ?? 0;
  const rev = data?.top_line?.smartsend_revenue_mtd ?? 0;

  const topLine = useMemo(() => {
    return `Jobs created by SmartSend this month: ${jobs.toLocaleString()} (~${formatMoney0(rev)}).`;
  }, [jobs, rev]);

  const weekLine =
    data?.comparison?.show
      ? `Jobs this week: SmartSend ${Number(data.comparison.smartsend_jobs_week || 0).toLocaleString()} | Other ${Number(
          data.comparison.other_jobs_week || 0
        ).toLocaleString()}`
      : null;

  const spendPerDollar =
    data?.efficiency?.spend_per_dollar_earned == null ? null : Number(data.efficiency.spend_per_dollar_earned);
  const efficiencyLine = `"$ spent per $1 earned (SmartSend): ${
    spendPerDollar == null ? "—" : formatMoney2(spendPerDollar)
  }"`;

  return (
    <section className="sticky top-14 z-30 -mx-4 sm:-mx-6 lg:-mx-8 mb-6 border-b border-gray-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-lg sm:text-xl font-extrabold tracking-tight text-gray-900">{topLine}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-gray-500">
          {weekLine ? <span>{weekLine}</span> : null}
          <span>{efficiencyLine}</span>
        </div>
      </div>
    </section>
  );
}




