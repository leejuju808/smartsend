// Block 22340 — SmartSend Roofing Job Cost Tracker v1
// Job Financials Panel Component
// Displays revenue, costs, profit, and margin for a single job

"use client";

import useSWR from "swr";
import { useState } from "react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface CostEntry {
  id: string;
  category: string;
  description?: string;
  vendor?: string;
  cost_date: string;
  amount: number;
}

interface Payment {
  id: string;
  payment_type: string;
  method?: string;
  amount: number;
  received_at?: string;
  status: string;
}

interface JobFinancials {
  id: string;
  title?: string;
  job_value: number;
  revenue_collected: number;
  actual_material_cost: number;
  actual_labor_cost: number;
  actual_other_cost: number;
  actual_total_cost: number;
  actual_gross_profit: number;
  actual_margin_pct: number;
  est_material_cost?: number;
  est_labor_cost?: number;
  est_other_cost?: number;
  est_gross_profit?: number;
  est_margin_pct?: number;
  status: string;
}

interface FinancialsData {
  job: JobFinancials;
  costEntries: CostEntry[];
  payments: Payment[];
}

export function JobFinancialsPanel({ jobId }: { jobId: string }) {
  const { data, error, mutate } = useSWR<FinancialsData>(
    `/api/jobs/${jobId}/financials`,
    fetcher
  );

  const [showAddCost, setShowAddCost] = useState(false);
  const [newCost, setNewCost] = useState({
    category: "materials",
    amount: "",
    description: "",
    vendor: "",
    cost_date: new Date().toISOString().split("T")[0],
  });

  if (!data && !error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-zinc-400">Loading financials…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-red-400">
          Error: {error instanceof Error ? error.message : "Failed to load financials"}
        </p>
      </div>
    );
  }

  const { job, costEntries, payments } = data || {
    job: null,
    costEntries: [],
    payments: [],
  };

  if (!job) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-red-400">Job not found</p>
      </div>
    );
  }

  const marginColor =
    job.actual_margin_pct >= 35
      ? "text-emerald-400"
      : job.actual_margin_pct >= 20
      ? "text-amber-400"
      : "text-red-400";

  const handleAddCost = async () => {
    if (!newCost.amount || parseFloat(newCost.amount) <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    try {
      const response = await fetch("/api/jobs/add-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          category: newCost.category,
          amount: parseFloat(newCost.amount),
          description: newCost.description || null,
          vendor: newCost.vendor || null,
          cost_date: newCost.cost_date,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add cost");
      }

      // Reset form and refresh data
      setNewCost({
        category: "materials",
        amount: "",
        description: "",
        vendor: "",
        cost_date: new Date().toISOString().split("T")[0],
      });
      setShowAddCost(false);
      mutate();
    } catch (err: any) {
      alert(err.message || "Failed to add cost");
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Financials
      </h3>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-[11px] text-zinc-500">Contract Value</p>
          <p className="text-sm font-semibold text-zinc-50">
            ${job.job_value?.toLocaleString() || 0}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Revenue Collected</p>
          <p className="text-sm font-semibold text-zinc-50">
            ${job.revenue_collected?.toLocaleString() || 0}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Total Cost</p>
          <p className="text-sm font-semibold text-zinc-50">
            ${job.actual_total_cost?.toLocaleString() || 0}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Gross Profit</p>
          <p className={`text-sm font-semibold ${marginColor}`}>
            ${job.actual_gross_profit?.toLocaleString() || 0}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-[11px] text-zinc-500">Margin</p>
          <p className={`text-lg font-semibold ${marginColor}`}>
            {job.revenue_collected > 0
              ? `${job.actual_margin_pct?.toFixed(1) || 0}%`
              : "—"}
          </p>
        </div>
      </div>

      {/* Cost Breakdown */}
      <div className="border-t border-zinc-800 pt-3 space-y-1 text-xs">
        <p className="text-[11px] font-medium text-zinc-400 mb-2">Cost Breakdown</p>
        <div className="flex justify-between">
          <span className="text-zinc-400">Materials</span>
          <span className="font-semibold text-zinc-50">
            ${job.actual_material_cost?.toLocaleString() || 0}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Labor</span>
          <span className="font-semibold text-zinc-50">
            ${job.actual_labor_cost?.toLocaleString() || 0}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Other</span>
          <span className="font-semibold text-zinc-50">
            ${job.actual_other_cost?.toLocaleString() || 0}
          </span>
        </div>
      </div>

      {/* Add Cost Button */}
      {!showAddCost && (
        <button
          onClick={() => setShowAddCost(true)}
          className="w-full text-xs px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
        >
          + Add Cost Entry
        </button>
      )}

      {/* Add Cost Form */}
      {showAddCost && (
        <div className="border-t border-zinc-800 pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={newCost.category}
              onChange={(e) =>
                setNewCost({ ...newCost, category: e.target.value })
              }
              className="text-xs px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-zinc-300"
            >
              <option value="materials">Materials</option>
              <option value="labor">Labor</option>
              <option value="overhead">Overhead</option>
              <option value="equipment">Equipment</option>
              <option value="dumpster">Dumpster</option>
              <option value="other">Other</option>
            </select>
            <input
              type="number"
              placeholder="Amount"
              value={newCost.amount}
              onChange={(e) => setNewCost({ ...newCost, amount: e.target.value })}
              className="text-xs px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-zinc-300"
            />
          </div>
          <input
            type="text"
            placeholder="Vendor (optional)"
            value={newCost.vendor}
            onChange={(e) => setNewCost({ ...newCost, vendor: e.target.value })}
            className="w-full text-xs px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-zinc-300"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newCost.description}
            onChange={(e) =>
              setNewCost({ ...newCost, description: e.target.value })
            }
            className="w-full text-xs px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-zinc-300"
          />
          <input
            type="date"
            value={newCost.cost_date}
            onChange={(e) => setNewCost({ ...newCost, cost_date: e.target.value })}
            className="w-full text-xs px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-zinc-300"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddCost}
              className="flex-1 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAddCost(false);
                setNewCost({
                  category: "materials",
                  amount: "",
                  description: "",
                  vendor: "",
                  cost_date: new Date().toISOString().split("T")[0],
                });
              }}
              className="flex-1 text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Cost Entries List */}
      {costEntries.length > 0 && (
        <div className="border-t border-zinc-800 pt-3">
          <p className="text-[11px] font-medium text-zinc-400 mb-2">Recent Costs</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {costEntries.slice(-5).map((c) => (
              <div
                key={c.id}
                className="flex justify-between text-[11px] text-zinc-400"
              >
                <span className="truncate">
                  {c.cost_date} • {c.category}
                  {c.vendor && ` • ${c.vendor}`}
                </span>
                <span className="font-semibold text-zinc-50">
                  ${c.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payments List */}
      {payments.length > 0 && (
        <div className="border-t border-zinc-800 pt-3">
          <p className="text-[11px] font-medium text-zinc-400 mb-2">Payments</p>
          <div className="max-h-24 overflow-y-auto space-y-1">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex justify-between text-[11px] text-zinc-400"
              >
                <span>
                  {p.received_at
                    ? new Date(p.received_at).toLocaleDateString()
                    : "—"}{" "}
                  • {p.payment_type}
                </span>
                <span className="font-semibold text-zinc-50">
                  ${p.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}








































