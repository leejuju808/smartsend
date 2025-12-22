"use client";

// Block 21745 — SmartSend Roofing Risk & Churn Radar v1
// Risk Radar Card Component
// Shows leads that are slipping away or need urgent follow-up

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

type RiskLead = {
  id: string;
  name: string | null;
  email: string | null;
  city: string | null;
  risk_level: "low" | "medium" | "high";
  risk_reason: string | null;
  last_activity_at: string | null;
  pipeline_stage: string | null;
};

export function RiskRadarCard() {
  const [rows, setRows] = useState<RiskLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leads/risk")
      .then((r) => r.json())
      .then((data) => {
        setRows(data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load risk leads:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-gray-400">
        Scanning risks…
      </div>
    );
  }

  const highRisk = rows.filter((r) => r.risk_level === "high");
  const mediumRisk = rows.filter((r) => r.risk_level === "medium");
  const lowRisk = rows.filter((r) => r.risk_level === "low");

  return (
    <div className="rounded-xl bg-white/5 border border-red-500/70 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-red-300">
            ⚠️ Risk & Churn Radar
          </div>
          <div className="text-xs text-gray-400">
            Leads that are slipping away or need urgent follow-up.
          </div>
        </div>
        {rows.length > 0 && (
          <div className="text-right">
            <div className="text-xs text-gray-400">Total at risk</div>
            <div className="text-lg font-bold text-red-300">{rows.length}</div>
          </div>
        )}
      </div>

      {rows.length === 0 && (
        <div className="text-xs text-gray-500 py-4 text-center">
          No leads at risk. Great job staying on top of your pipeline!
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* Risk summary */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg px-2 py-1.5 border border-red-500/70 bg-red-500/10 text-red-100">
              <div className="text-[10px] text-gray-400">High Risk</div>
              <div className="text-sm font-semibold">{highRisk.length}</div>
            </div>
            <div className="rounded-lg px-2 py-1.5 border border-yellow-500/70 bg-yellow-500/10 text-yellow-100">
              <div className="text-[10px] text-gray-400">Medium Risk</div>
              <div className="text-sm font-semibold">{mediumRisk.length}</div>
            </div>
            <div className="rounded-lg px-2 py-1.5 border border-gray-500/70 bg-gray-500/10 text-gray-200">
              <div className="text-[10px] text-gray-400">Low Risk</div>
              <div className="text-sm font-semibold">{lowRisk.length}</div>
            </div>
          </div>

          {/* List of risk leads */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {rows.map((r) => (
              <Link
                href={`/leads/${r.id}`}
                key={r.id}
                className="block rounded-lg bg-black/40 border border-white/10 p-2 hover:bg-black/60 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">
                      {r.name || r.email || "Homeowner"}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {r.risk_reason || "Risk detected"}
                    </div>
                    {r.last_activity_at && (
                      <div className="text-[10px] text-gray-500 mt-1">
                        Last activity:{" "}
                        {formatDistanceToNow(new Date(r.last_activity_at), {
                          addSuffix: true,
                        })}
                      </div>
                    )}
                    {r.pipeline_stage && (
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        Stage: {r.pipeline_stage.replace(/_/g, " ")}
                      </div>
                    )}
                  </div>
                  <div
                    className={`text-[10px] uppercase font-semibold px-2 py-1 rounded ${
                      r.risk_level === "high"
                        ? "text-red-400 bg-red-500/20"
                        : r.risk_level === "medium"
                        ? "text-yellow-400 bg-yellow-500/20"
                        : "text-gray-400 bg-gray-500/20"
                    }`}
                  >
                    {r.risk_level}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="text-[10px] text-gray-500 pt-2 border-t border-white/10">
        SmartSend automatically flags leads that need attention. This prevents
        lost jobs and keeps your pipeline healthy.
      </div>
    </div>
  );
}

