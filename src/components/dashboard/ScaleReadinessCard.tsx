"use client";

import { useEffect, useMemo, useState } from "react";

type ScaleStatus = {
  company_id: string | null;
  scale_score: number;
  tier: "locked" | "limited" | "unlocked" | string;
  computed_at: string;
  factors?: Array<{ key: string; label: string; score: number; weight: number }>;
  blockers?: Array<{ key: string; label: string; value?: any; score?: number }>;
};

function titleForTier(tier: string) {
  if (tier === "unlocked") return "Scale Unlocked";
  if (tier === "limited") return "Limited Scale";
  return "Scale Locked";
}

function limitCopy(tier: string) {
  if (tier === "unlocked") return "Outreach limits lifted • Priority sending enabled";
  if (tier === "limited") return "Outreach up to 50/day • Normal follow-ups";
  return "Max outreach: 25/day • Follow-ups capped";
}

export function ScaleReadinessCard(props: { onStatus?: (s: ScaleStatus | null) => void }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ScaleStatus | null>(null);

  const badgeCls = useMemo(() => {
    const t = status?.tier;
    if (t === "unlocked") return "border-emerald-200 bg-emerald-50 text-emerald-800";
    if (t === "limited") return "border-amber-200 bg-amber-50 text-amber-900";
    return "border-rose-200 bg-rose-50 text-rose-900";
  }, [status?.tier]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/scale/status", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Failed to load scale status");
        if (cancelled) return;
        setStatus(json);
        props.onStatus?.(json);
      } catch (e) {
        console.error(e);
        if (cancelled) return;
        setStatus(null);
        props.onStatus?.(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    const t = setInterval(run, 60_000); // refresh every minute
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blockers = status?.blockers || [];
  const top2 = blockers.slice(0, 2);

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-gray-500">Scale Readiness</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="text-2xl font-semibold">{loading ? "—" : status?.scale_score ?? 0}</div>
            <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${badgeCls}`}>
              {loading ? "Loading…" : titleForTier(status?.tier || "locked")}
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-600">{limitCopy(status?.tier || "locked")}</div>
        </div>
      </div>

      <div className="mt-3 text-sm text-gray-700">
        SmartSend protects your deliverability and reputation while you grow.
      </div>

      <div className="mt-3">
        <div className="text-xs font-medium text-gray-700">What’s blocking scale</div>
        {loading ? (
          <div className="mt-2 text-sm text-gray-500">Checking…</div>
        ) : top2.length === 0 ? (
          <div className="mt-2 text-sm text-gray-500">Nothing critical right now.</div>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            {top2.map((b, idx) => (
              <li key={`${b.key}-${idx}`} className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-gray-400" />
                <span>{b.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}









