"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type EnforcementSummary = {
  ok: boolean;
  as_of: string;
  minimum_daily_sends: number;
  sends_today: number;
  remaining_to_minimum: number;
  hot_homeowners_waiting: number;
};

const SERIOUS_LINE = "Consistent outreach is standard for professional roofing companies.";

export function EnforcementBanners() {
  const [data, setData] = useState<EnforcementSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/enforce/summary", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as EnforcementSummary | null;
        if (!cancelled) setData(res.ok ? json : null);
      } catch {
        if (!cancelled) setData(null);
      }
    }

    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const shouldShowSeriousLine = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("ss_serious_companies_line_seen") !== "1";
    } catch {
      return false;
    }
  }, [data?.as_of]);

  useEffect(() => {
    if (!data) return;
    if (data.remaining_to_minimum <= 0) return;

    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem("ss_serious_companies_line_seen") !== "1") {
        localStorage.setItem("ss_serious_companies_line_seen", "1");
      }
    } catch {
      // ignore
    }
  }, [data]);

  if (!data?.ok) return null;

  const showHotWaiting = (data.hot_homeowners_waiting ?? 0) > 0;
  const showMinActivity = (data.minimum_daily_sends ?? 0) > 0 && (data.remaining_to_minimum ?? 0) > 0;

  if (!showHotWaiting && !showMinActivity) return null;

  return (
    <div className="space-y-2">
      {showHotWaiting ? (
        <Link href="/dashboard/inbox-unified?filter=hot_lead" className="block">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
            Homeowners waiting.
          </div>
        </Link>
      ) : null}

      {showMinActivity ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">Minimum daily sends: {data.remaining_to_minimum} remaining today.</div>
          {shouldShowSeriousLine ? <div className="mt-1 text-xs text-amber-800/80">{SERIOUS_LINE}</div> : null}
        </div>
      ) : null}
    </div>
  );
}




