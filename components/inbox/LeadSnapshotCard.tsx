// Block 20350 — Lead Snapshot Card v2

"use client";

import { useEffect, useState } from "react";

interface Snapshot {
  headline: string;
  summary: string;
  opportunity_score: number | null;
  job_type: string | null;
  risk_flags: string[];
  key_factors: string[];
  suggested_talk_track: string;
}

interface LeadSnapshotCardProps {
  conversationId: string;
}

export function LeadSnapshotCard({ conversationId }: LeadSnapshotCardProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/inbox/ai-lead-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      if (!res.ok) {
        throw new Error(`Failed to load snapshot: ${res.statusText}`);
      }

      const json = await res.json();
      setSnapshot(json.snapshot ?? null);
    } catch (err) {
      console.error("Lead snapshot load error", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [conversationId]);

  const score = snapshot?.opportunity_score ?? null;
  const clampedScore =
    score != null ? Math.min(100, Math.max(0, score)) : null;

  function scoreLabel(val: number | null) {
    if (val == null) return "No score yet";
    if (val >= 80) return "High-value opportunity";
    if (val >= 50) return "Promising opportunity";
    if (val >= 20) return "Moderate opportunity";
    return "Low opportunity";
  }

  return (
    <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-2 mb-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            AI homeowner snapshot
          </p>
          <p className="text-[10px] text-gray-400">
            Uses property, roof, engagement, and insurance data.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="text-[10px] text-gray-400 underline hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {!snapshot && !loading && (
        <p className="text-[11px] text-gray-500">
          Snapshot not available yet. Click refresh to generate it.
        </p>
      )}

      {snapshot && (
        <>
          {/* Headline & summary */}
          <div>
            <p className="text-xs font-semibold text-gray-900">
              {snapshot.headline}
            </p>
            {snapshot.job_type && (
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Job type: {snapshot.job_type}
              </p>
            )}
            {snapshot.summary && (
              <p className="text-[11px] text-gray-700 mt-1">
                {snapshot.summary}
              </p>
            )}
          </div>

          {/* Opportunity score bar */}
          <div className="mt-1">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-gray-600">Opportunity score</span>
              <span className="font-semibold text-gray-800">
                {score != null ? `${Math.round(score)} / 100` : "N/A"}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
              {clampedScore != null && (
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-slate-400 via-amber-400 to-red-500"
                  style={{ width: `${clampedScore}%` }}
                />
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {scoreLabel(score)}
            </p>
          </div>

          {/* Key factors & risks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            {snapshot.key_factors && snapshot.key_factors.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-800 mb-1">
                  Why this matters
                </p>
                <ul className="space-y-0.5">
                  {snapshot.key_factors.map((f, idx) => (
                    <li
                      key={idx}
                      className="text-[11px] text-gray-700 flex gap-1"
                    >
                      <span>•</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {snapshot.risk_flags && snapshot.risk_flags.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-800 mb-1">
                  Risks / watch outs
                </p>
                <ul className="space-y-0.5">
                  {snapshot.risk_flags.map((r, idx) => (
                    <li
                      key={idx}
                      className="text-[11px] text-gray-700 flex gap-1"
                    >
                      <span>•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Suggested talk track */}
          {snapshot.suggested_talk_track && (
            <div className="border-t pt-2 mt-2">
              <p className="text-[11px] font-semibold text-gray-800 mb-1">
                Suggested talk track
              </p>
              <p className="text-[11px] text-gray-700">
                {snapshot.suggested_talk_track}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

