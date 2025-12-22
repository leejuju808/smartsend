"use client";

import { useEffect, useState } from "react";

type CityAccessStatus = "active" | "at_risk";

type CityAccessResponse = {
  workspace_id: string;
  market: { city: string | null; state: string | null; market_key: string | null };
  status: CityAccessStatus;
  last_send_at: string | null;
  days_inactive: number | null;
  inactivity_days_threshold: number;
  copy: { headline: string; subtext: string; early: string };
};

export function CityAccessIndicator({
  variant = "card",
  showMarket = true,
}: {
  variant?: "card" | "inline";
  showMarket?: boolean;
}) {
  const [data, setData] = useState<CityAccessResponse | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch("/api/city-access", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as CityAccessResponse | null;
        if (!alive) return;
        if (json) setData(json);
      } catch {
        // ignore
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return null;

  const isRisk = data.status === "at_risk";
  const marketLabel =
    data.market?.city && data.market?.state ? `${data.market.city}, ${data.market.state}` : data.market?.city ?? null;

  if (variant === "inline") {
    return (
      <div
        className={[
          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
          isRisk ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900",
        ].join(" ")}
        title={data.copy.subtext}
      >
        <span className="font-semibold">{data.copy.headline}</span>
        {showMarket && marketLabel ? <span className="text-[11px] opacity-80">• {marketLabel}</span> : null}
      </div>
    );
  }

  return (
    <div
      className={[
        "rounded-2xl border p-6 bg-white space-y-2",
        isRisk ? "border-amber-200" : "border-slate-200",
      ].join(" ")}
    >
      <div className="text-sm text-slate-500">City access</div>
      <div className="text-lg font-semibold">{data.copy.headline}</div>
      {showMarket && marketLabel ? <div className="text-sm text-slate-600">{marketLabel}</div> : null}
      <div className="text-sm text-slate-500">{data.copy.subtext}</div>
      <div className="text-xs text-slate-400">{data.copy.early}</div>
    </div>
  );
}







