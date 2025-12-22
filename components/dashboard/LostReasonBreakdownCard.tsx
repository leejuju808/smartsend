// Block 20230 — Lost Reason Breakdown Card

"use client";

import { useEffect, useState } from "react";

type ReasonRow = {
  reason: string;
  count: number;
};

type CompetitorRow = {
  name: string;
  count: number;
  avgBid: number;
};

export function LostReasonBreakdownCard() {
  const [reasons, setReasons] = useState<ReasonRow[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/inbox/lost-summary");
      if (!res.ok) {
        throw new Error("Failed to load lost summary");
      }
      const json = await res.json();
      setReasons(json.reasons ?? []);
      setCompetitors(json.competitors ?? []);
    } catch (error) {
      console.error("Error loading lost summary:", error);
      setReasons([]);
      setCompetitors([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function labelForReason(key: string) {
    switch (key) {
      case "price":
        return "Price too high";
      case "chose_competitor":
        return "Chose another roofer";
      case "timing":
        return "Timing / schedule";
      case "insurance_denied":
        return "Insurance denied";
      case "other":
        return "Other";
      default:
        return "Unknown";
    }
  }

  return (
    <div className="p-4 bg-white rounded-xl border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">
          Lost jobs — reasons & competitors
        </h3>
        <button
          onClick={load}
          className="text-[11px] text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {reasons.length === 0 && !loading && (
        <p className="text-[11px] text-gray-400">
          No lost jobs recorded with reasons yet.
        </p>
      )}

      {reasons.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-[11px] font-semibold text-gray-700 mb-1">
              Top reasons
            </p>
            <div className="space-y-1">
              {reasons.map((r) => (
                <div
                  key={r.reason}
                  className="flex items-center justify-between"
                >
                  <span className="text-gray-600">{labelForReason(r.reason)}</span>
                  <span className="text-gray-900 font-semibold">{r.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-700 mb-1">
              Top competitors
            </p>
            {competitors.length === 0 && (
              <p className="text-[11px] text-gray-400">
                No competitor data yet.
              </p>
            )}
            {competitors.length > 0 && (
              <div className="space-y-1">
                {competitors.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between"
                  >
                    <div className="flex flex-col">
                      <span className="text-gray-700 font-medium">{c.name}</span>
                      {c.avgBid > 0 && (
                        <span className="text-[10px] text-gray-500">
                          Avg bid: ${c.avgBid.toFixed(0)}
                        </span>
                      )}
                    </div>
                    <span className="text-gray-900 font-semibold">{c.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

















































