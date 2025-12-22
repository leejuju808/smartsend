// Block 26340 — SmartSend Roofing Profit & Collections Owner Dashboard v1
// Owner-only view • Daily money report • Past-due snapshot • Profit per job • Cashflow + AR integration

"use client";

import { useEffect, useState } from "react";

interface DashboardData {
  ar: {
    total_ar: number;
    overdue_ar: number;
    overdue_invoices_count: number;
  };
  cashflowSummary: {
    incoming_30d: number;
    outgoing_30d: number;
    net_30d: number;
  };
  cashflowDaily: Array<{
    day: string;
    incoming: number;
    outgoing: number;
    net: number;
  }>;
  topProfitable: Array<{
    job_id: string;
    job_name: string;
    status: string;
    gross_profit: number;
    margin: number;
  }>;
  bottomAtRisk: Array<{
    job_id: string;
    job_name: string;
    status: string;
    gross_profit: number;
    margin: number;
  }>;
  overdue: Array<{
    invoice_id: string;
    payer_name: string | null;
    payer_email: string | null;
    balance_due: number;
    due_date: string | null;
  }>;
  dueSoon: Array<{
    invoice_id: string;
    payer_name: string | null;
    payer_email: string | null;
    balance_due: number;
    due_date: string | null;
  }>;
}

export default function OwnerDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/owner-dashboard")
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Failed to load: ${r.statusText}`);
        }
        return r.json();
      })
      .then(setData)
      .catch((err) => {
        console.error("Dashboard fetch error:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg">Loading owner dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div>No data available</div>
      </div>
    );
  }

  const {
    ar,
    cashflowSummary,
    cashflowDaily,
    topProfitable,
    bottomAtRisk,
    overdue,
    dueSoon,
  } = data;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Owner Money Dashboard</h1>
        <p className="text-gray-600">
          Your financial cockpit — see everything at a glance
        </p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total AR (Unpaid)"
          value={`$${formatNumber(ar?.total_ar || 0)}`}
        />
        <KpiCard
          label="Overdue AR"
          value={`$${formatNumber(ar?.overdue_ar || 0)}`}
          highlight="red"
          subtitle={`${ar?.overdue_invoices_count || 0} invoices`}
        />
        <KpiCard
          label="Net Cashflow (Next 30d)"
          value={`$${formatNumber(cashflowSummary?.net_30d || 0)}`}
          highlight={(cashflowSummary?.net_30d || 0) < 0 ? "red" : "green"}
        />
        <KpiCard
          label="Avg Margin (Active Jobs)"
          value={`${averageMargin([...topProfitable, ...bottomAtRisk]).toFixed(1)}%`}
        />
      </div>

      {/* Profit by Job */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <JobList title="Top Profitable Jobs" jobs={topProfitable} positive />
        <JobList title="At-Risk Jobs (Low Margin)" jobs={bottomAtRisk} />
      </div>

      {/* Collections + Cashflow */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CollectionsPanel overdue={overdue} dueSoon={dueSoon} />
        <CashflowChart daily={cashflowDaily} />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  highlight,
  subtitle,
}: {
  label: string;
  value: string;
  highlight?: "red" | "green";
  subtitle?: string;
}) {
  const color =
    highlight === "red"
      ? "text-red-600"
      : highlight === "green"
      ? "text-green-600"
      : "text-gray-900";

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + "K";
  }
  return num.toFixed(0);
}

function averageMargin(jobs: any[]): number {
  if (!jobs.length) return 0;
  const margins = jobs.map((j) => j.margin || 0).filter((m) => m > 0);
  if (margins.length === 0) return 0;
  return margins.reduce((a, b) => a + b, 0) / margins.length;
}

function JobList({
  title,
  jobs,
  positive,
}: {
  title: string;
  jobs: Array<{
    job_id: string;
    job_name: string;
    status: string;
    gross_profit: number;
    margin: number;
  }>;
  positive?: boolean;
}) {
  if (!jobs || jobs.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold mb-3">{title}</h2>
        <div className="text-sm text-gray-400">No jobs found</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-semibold mb-3">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b">
              <th align="left" className="pb-2">Job</th>
              <th align="right" className="pb-2">Profit</th>
              <th align="right" className="pb-2">Margin</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.job_id} className="border-b last:border-0">
                <td className="py-2">
                  <div className="font-medium">{j.job_name}</div>
                  <div className="text-xs text-gray-400">{j.status}</div>
                </td>
                <td align="right" className="py-2">
                  ${formatNumber(Number(j.gross_profit || 0))}
                </td>
                <td
                  align="right"
                  className={`py-2 font-medium ${
                    Number(j.margin || 0) < 25
                      ? "text-red-600"
                      : positive
                      ? "text-green-600"
                      : ""
                  }`}
                >
                  {Number(j.margin || 0).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CollectionsPanel({
  overdue,
  dueSoon,
}: {
  overdue: Array<{
    invoice_id: string;
    payer_name: string | null;
    payer_email: string | null;
    balance_due: number;
    due_date: string | null;
  }>;
  dueSoon: Array<{
    invoice_id: string;
    payer_name: string | null;
    payer_email: string | null;
    balance_due: number;
    due_date: string | null;
  }>;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-semibold mb-3">Collections Snapshot</h2>

      <div className="mb-4">
        <h3 className="text-xs font-bold text-red-600 mb-2">
          Overdue ({overdue.length})
        </h3>
        {overdue.length === 0 ? (
          <div className="text-sm text-gray-400">No overdue invoices</div>
        ) : (
          <ul className="text-sm space-y-2 max-h-40 overflow-y-auto">
            {overdue.map((inv) => (
              <li
                key={inv.invoice_id}
                className="flex justify-between items-center py-1 border-b last:border-0"
              >
                <div>
                  <div className="font-medium">
                    {inv.payer_name || inv.payer_email || "Unknown"}
                  </div>
                  {inv.due_date && (
                    <div className="text-xs text-gray-400">
                      Due: {new Date(inv.due_date).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <span className="font-semibold text-red-600">
                  ${formatNumber(inv.balance_due)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-xs font-bold text-yellow-600 mb-2">
          Due Soon ({dueSoon.length})
        </h3>
        {dueSoon.length === 0 ? (
          <div className="text-sm text-gray-400">No invoices due soon</div>
        ) : (
          <ul className="text-sm space-y-2 max-h-40 overflow-y-auto">
            {dueSoon.map((inv) => (
              <li
                key={inv.invoice_id}
                className="flex justify-between items-center py-1 border-b last:border-0"
              >
                <div>
                  <div className="font-medium">
                    {inv.payer_name || inv.payer_email || "Unknown"}
                  </div>
                  {inv.due_date && (
                    <div className="text-xs text-gray-400">
                      Due: {new Date(inv.due_date).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <span className="font-semibold">
                  ${formatNumber(inv.balance_due)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CashflowChart({
  daily,
}: {
  daily: Array<{
    day: string;
    incoming: number;
    outgoing: number;
    net: number;
  }>;
}) {
  if (!daily || daily.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold mb-3">Cashflow (Next 30 Days)</h2>
        <div className="text-sm text-gray-400">No cashflow data available</div>
      </div>
    );
  }

  // Find min/max for scaling
  const netValues = daily.map((d) => d.net);
  const minNet = Math.min(...netValues, 0);
  const maxNet = Math.max(...netValues, 0);
  const range = maxNet - minNet || 1;

  // Simple bar chart representation
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-semibold mb-3">Cashflow (Next 30 Days)</h2>
      <div className="text-xs text-gray-500 mb-4">
        Positive net days = growth window. Negative days = risk window.
      </div>

      {/* Simple visualization */}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {daily.slice(0, 30).map((day) => {
          const isPositive = day.net >= 0;
          const barWidth = Math.abs(day.net) / range;
          return (
            <div key={day.day} className="flex items-center gap-2 text-xs">
              <div className="w-20 text-gray-600">
                {new Date(day.day).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="flex-1 flex items-center">
                <div
                  className={`h-4 rounded ${
                    isPositive ? "bg-green-200" : "bg-red-200"
                  }`}
                  style={{
                    width: `${Math.min(barWidth * 100, 100)}%`,
                  }}
                />
                <span
                  className={`ml-2 font-medium ${
                    isPositive ? "text-green-600" : "text-red-600"
                  }`}
                >
                  ${formatNumber(day.net)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary stats */}
      <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-gray-500">Total Incoming</div>
          <div className="font-semibold text-green-600">
            ${formatNumber(daily.reduce((sum, d) => sum + d.incoming, 0))}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Total Outgoing</div>
          <div className="font-semibold text-red-600">
            ${formatNumber(daily.reduce((sum, d) => sum + d.outgoing, 0))}
          </div>
        </div>
      </div>
    </div>
  );
}



































