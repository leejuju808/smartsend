// Block 43000 — SmartSend Roofing "Job Costs + Labor & Material Budget Engine" v1
// Job Cost Detail Page

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

interface Estimate {
  id: string;
  estimated_materials: any;
  estimated_labor_hours: number;
  estimated_labor_rate: number;
  estimated_crew_size: number;
  dumpster_cost: number;
  delivery_cost: number;
  other_costs: number;
  estimated_total_cost: number;
}

interface ActualCosts {
  actual_material_cost: number;
  actual_labor_cost: number;
  change_order_total: number;
  actual_total_cost: number;
  estimated_profit: number;
  actual_profit: number;
  margin_loss: number;
}

interface MaterialUsage {
  id: string;
  material_name: string;
  quantity: number;
  unit: string;
  created_at: string;
}

interface Overrun {
  id: string;
  category: string;
  amount: number;
  percentage_over: number;
  notes: string;
  acknowledged: boolean;
  created_at: string;
}

export default function JobCostDetailPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const supabase = createClient();

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [actualCosts, setActualCosts] = useState<ActualCosts | null>(null);
  const [materialUsage, setMaterialUsage] = useState<MaterialUsage[]>([]);
  const [laborHours, setLaborHours] = useState<number>(0);
  const [changeOrders, setChangeOrders] = useState<any[]>([]);
  const [overruns, setOverruns] = useState<Overrun[]>([]);
  const [jobValue, setJobValue] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    loadData();
  }, [jobId]);

  async function loadData() {
    try {
      setLoading(true);

      const response = await fetch(`/api/jobs/${jobId}/costs/calculate`);
      if (!response.ok) throw new Error("Failed to load costs");

      const data = await response.json();
      setEstimate(data.estimate);
      setActualCosts(data.actualCosts);
      setMaterialUsage(data.materialUsage || []);
      setLaborHours(data.laborHours || 0);
      setChangeOrders(data.changeOrders || []);
      setOverruns(data.overruns || []);
      setJobValue(data.jobValue || 0);
    } catch (error) {
      console.error("Error loading job costs:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCalculate() {
    try {
      setCalculating(true);
      const response = await fetch(`/api/jobs/${jobId}/costs/calculate`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to calculate costs");
      await loadData();
    } catch (error) {
      console.error("Error calculating costs:", error);
      alert("Failed to calculate costs. Please try again.");
    } finally {
      setCalculating(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-400">Loading job costs...</div>
      </div>
    );
  }

  const marginPct =
    jobValue > 0 && actualCosts
      ? ((actualCosts.actual_profit || 0) / jobValue) * 100
      : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/jobs/costs"
            className="text-sm text-zinc-400 hover:text-zinc-300 mb-2 inline-block"
          >
            ← Back to Job Costing Overview
          </Link>
          <h1 className="text-2xl font-semibold text-zinc-50">Job Costs</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Estimated vs actual costs and margin tracking
          </p>
        </div>
        <button
          onClick={handleCalculate}
          disabled={calculating}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {calculating ? "Calculating..." : "Recalculate Costs"}
        </button>
      </div>

      {/* Profit Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-xs text-zinc-400 mb-1">Estimated Profit</div>
          <div className="text-2xl font-semibold text-zinc-50">
            {formatCurrency(actualCosts?.estimated_profit || 0)}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-xs text-zinc-400 mb-1">Actual Profit</div>
          <div className="text-2xl font-semibold text-zinc-50">
            {formatCurrency(actualCosts?.actual_profit || 0)}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-xs text-zinc-400 mb-1">Margin Loss</div>
          <div
            className={`text-2xl font-semibold ${
              (actualCosts?.margin_loss || 0) < 0
                ? "text-red-400"
                : "text-green-400"
            }`}
          >
            {formatCurrency(actualCosts?.margin_loss || 0)}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-xs text-zinc-400 mb-1">Margin %</div>
          <div
            className={`text-2xl font-semibold ${
              marginPct >= 30
                ? "text-green-400"
                : marginPct >= 20
                ? "text-yellow-400"
                : "text-red-400"
            }`}
          >
            {marginPct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Overrun Alerts */}
      {overruns.filter((o) => !o.acknowledged).length > 0 && (
        <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚠️</span>
            <h3 className="font-semibold text-red-400">Job Over Budget</h3>
          </div>
          <div className="space-y-2">
            {overruns
              .filter((o) => !o.acknowledged)
              .map((overrun) => (
                <div
                  key={overrun.id}
                  className="text-sm text-zinc-300 bg-zinc-900/50 rounded-lg p-2"
                >
                  <div className="font-medium">
                    {overrun.category.toUpperCase()} Overrun:{" "}
                    {formatCurrency(overrun.amount)} (
                    {overrun.percentage_over?.toFixed(1)}% over estimate)
                  </div>
                  {overrun.notes && (
                    <div className="text-zinc-400 text-xs mt-1">
                      {overrun.notes}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="estimate">Estimate</TabsTrigger>
          <TabsTrigger value="actual">Actual Costs</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="labor">Labor</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
            <h3 className="text-lg font-semibold text-zinc-50 mb-4">
              Cost Summary
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-zinc-400 mb-2">Estimated Cost</div>
                <div className="text-xl font-semibold text-zinc-50">
                  {formatCurrency(estimate?.estimated_total_cost || 0)}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-400 mb-2">Actual Cost</div>
                <div className="text-xl font-semibold text-zinc-50">
                  {formatCurrency(actualCosts?.actual_total_cost || 0)}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-400 mb-2">Variance</div>
                <div
                  className={`text-xl font-semibold ${
                    (actualCosts?.actual_total_cost || 0) >
                    (estimate?.estimated_total_cost || 0)
                      ? "text-red-400"
                      : "text-green-400"
                  }`}
                >
                  {formatCurrency(
                    (actualCosts?.actual_total_cost || 0) -
                      (estimate?.estimated_total_cost || 0)
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-400 mb-2">Job Value</div>
                <div className="text-xl font-semibold text-zinc-50">
                  {formatCurrency(jobValue)}
                </div>
              </div>
            </div>
          </div>

          {changeOrders.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
              <h3 className="text-lg font-semibold text-zinc-50 mb-4">
                Change Orders
              </h3>
              <div className="space-y-2">
                {changeOrders.map((co) => (
                  <div
                    key={co.id}
                    className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg"
                  >
                    <div>
                      <div className="text-sm font-medium text-zinc-50">
                        {co.reason_category || "Change Order"}
                      </div>
                      <div className="text-xs text-zinc-400">
                        Status: {co.status}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-zinc-50">
                      {formatCurrency(
                        co.roofing_change_order_revenue?.[0]?.amount || 0
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="estimate" className="space-y-4">
          {estimate ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
              <h3 className="text-lg font-semibold text-zinc-50">
                Estimate Breakdown
              </h3>

              <div>
                <div className="text-sm text-zinc-400 mb-2">Materials</div>
                <div className="bg-zinc-900/50 rounded-lg p-3">
                  <pre className="text-xs text-zinc-300 whitespace-pre-wrap">
                    {JSON.stringify(estimate.estimated_materials, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-zinc-400 mb-1">
                    Labor Hours
                  </div>
                  <div className="text-lg font-semibold text-zinc-50">
                    {estimate.estimated_labor_hours}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-400 mb-1">Labor Rate</div>
                  <div className="text-lg font-semibold text-zinc-50">
                    {formatCurrency(estimate.estimated_labor_rate)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-400 mb-1">Crew Size</div>
                  <div className="text-lg font-semibold text-zinc-50">
                    {estimate.estimated_crew_size}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-400 mb-1">
                    Dumpster Cost
                  </div>
                  <div className="text-lg font-semibold text-zinc-50">
                    {formatCurrency(estimate.dumpster_cost)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-400 mb-1">Delivery Cost</div>
                  <div className="text-lg font-semibold text-zinc-50">
                    {formatCurrency(estimate.delivery_cost)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-400 mb-1">Other Costs</div>
                  <div className="text-lg font-semibold text-zinc-50">
                    {formatCurrency(estimate.other_costs)}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold text-zinc-50">
                    Total Estimated Cost
                  </div>
                  <div className="text-2xl font-bold text-zinc-50">
                    {formatCurrency(estimate.estimated_total_cost)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-center text-zinc-400">
              No estimate created yet. Create an estimate to start tracking
              costs.
            </div>
          )}
        </TabsContent>

        <TabsContent value="actual" className="space-y-4">
          {actualCosts ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
              <h3 className="text-lg font-semibold text-zinc-50">
                Actual Costs
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-zinc-400 mb-1">
                    Material Cost
                  </div>
                  <div className="text-xl font-semibold text-zinc-50">
                    {formatCurrency(actualCosts.actual_material_cost)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-400 mb-1">Labor Cost</div>
                  <div className="text-xl font-semibold text-zinc-50">
                    {formatCurrency(actualCosts.actual_labor_cost)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-400 mb-1">
                    Change Orders
                  </div>
                  <div className="text-xl font-semibold text-zinc-50">
                    {formatCurrency(actualCosts.change_order_total)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-400 mb-1">Total Cost</div>
                  <div className="text-xl font-semibold text-zinc-50">
                    {formatCurrency(actualCosts.actual_total_cost)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-center text-zinc-400">
              No actual costs recorded yet. Costs will be calculated as materials
              and labor are logged.
            </div>
          )}
        </TabsContent>

        <TabsContent value="materials" className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
            <h3 className="text-lg font-semibold text-zinc-50 mb-4">
              Material Usage
            </h3>
            {materialUsage.length > 0 ? (
              <div className="space-y-2">
                {materialUsage.map((usage) => (
                  <div
                    key={usage.id}
                    className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg"
                  >
                    <div>
                      <div className="text-sm font-medium text-zinc-50">
                        {usage.material_name}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {new Date(usage.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-zinc-50">
                      {usage.quantity} {usage.unit}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-zinc-400 text-sm">
                No material usage logged yet.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="labor" className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
            <h3 className="text-lg font-semibold text-zinc-50 mb-4">
              Labor Hours
            </h3>
            <div>
              <div className="text-sm text-zinc-400 mb-1">Total Hours</div>
              <div className="text-2xl font-semibold text-zinc-50">
                {laborHours.toFixed(2)}
              </div>
            </div>
            {actualCosts && (
              <div className="mt-4">
                <div className="text-sm text-zinc-400 mb-1">Total Labor Cost</div>
                <div className="text-xl font-semibold text-zinc-50">
                  {formatCurrency(actualCosts.actual_labor_cost)}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
































