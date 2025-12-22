// Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1
// Underbid Alerts Component
// Shows alerts for underpriced proposals

"use client";

import Link from "next/link";

interface UnderbidAlert {
  id: string;
  proposed_price: number;
  minimum_profitable_price: number;
  potential_loss: number;
  missing_costs: any;
  suggested_corrections: any;
  risk_factors: string[];
  jobs: {
    id: string;
    contract_value: number;
    stage: string;
  } | null;
}

export function UnderbidAlerts({ alerts }: { alerts: UnderbidAlert[] }) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="bg-red-950/20 border border-red-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">⚠️</span>
        <h2 className="text-lg font-semibold text-red-400">
          Underbid Alerts
        </h2>
        <span className="text-sm text-red-300 bg-red-900/30 px-2 py-1 rounded">
          {alerts.length} {alerts.length === 1 ? "proposal" : "proposals"}
        </span>
      </div>
      <p className="text-sm text-red-300 mb-4">
        You have {alerts.length} underpriced {alerts.length === 1 ? "proposal" : "proposals"} — fix before sending.
      </p>
      <div className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="bg-zinc-900 rounded-lg border border-red-800/50 p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <Link
                href={`/dashboard/jobs/${alert.jobs?.id || alert.id}`}
                className="text-sm font-medium text-zinc-100 hover:text-blue-400"
              >
                Job {alert.jobs?.id?.slice(0, 8) || alert.id.slice(0, 8)}
              </Link>
              <span className="text-xs px-2 py-0.5 bg-red-900/30 rounded text-red-300">
                {alert.jobs?.stage || "unknown"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-zinc-400 mb-1">Proposed Price</div>
                <div className="text-zinc-100 font-medium">
                  ${alert.proposed_price.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">Minimum Price</div>
                <div className="text-emerald-400 font-medium">
                  ${alert.minimum_profitable_price.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">Potential Loss</div>
                <div className="text-red-400 font-medium">
                  ${Math.round(alert.potential_loss).toLocaleString()}
                </div>
              </div>
            </div>
            {alert.risk_factors && alert.risk_factors.length > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-700">
                <div className="text-xs text-zinc-400 mb-1">Risk Factors:</div>
                <ul className="text-xs text-red-300 space-y-1">
                  {alert.risk_factors.map((risk, idx) => (
                    <li key={idx}>• {risk}</li>
                  ))}
                </ul>
              </div>
            )}
            {alert.suggested_corrections && (
              <div className="mt-3 pt-3 border-t border-zinc-700">
                <div className="text-xs text-zinc-400 mb-1">Suggested Correction:</div>
                <div className="text-sm text-emerald-300">
                  Increase price to ${alert.suggested_corrections.recommended_price?.toLocaleString() || alert.minimum_profitable_price.toLocaleString()}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}





























