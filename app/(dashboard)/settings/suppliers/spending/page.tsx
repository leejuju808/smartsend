// Block 41700 — SmartSend Roofing Material Ordering Engine v1
// Supplier Spending Dashboard
// Shows total spent per supplier, monthly costs, average cost per square, etc.

"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, TrendingUp, Package, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import React from "react";
import { format } from "date-fns";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SupplierSpendingPage() {
  const supabase = createClient();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>(
    format(new Date(new Date().setMonth(new Date().getMonth() - 1)), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );

  React.useEffect(() => {
    async function getWorkspace() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: member } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .single();
        if (member) {
          setWorkspaceId(member.workspace_id);
        }
      }
    }
    getWorkspace();
  }, [supabase]);

  const { data, error } = useSWR<{
    workspace_id: string;
    period_start: string;
    period_end: string;
    total_spent: number;
    supplier_breakdown: Array<{
      supplier_id: string;
      supplier_name: string;
      total_orders: number;
      total_spent: number;
      avg_order_value: number;
    }>;
  }>(
    workspaceId
      ? `/api/suppliers/spending?workspace_id=${workspaceId}&start_date=${startDate}&end_date=${endDate}`
      : null,
    fetcher
  );

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-400">Error loading spending data: {error.message}</p>
      </div>
    );
  }

  const dashboard = data || {
    total_spent: 0,
    supplier_breakdown: [],
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Supplier Spending Dashboard</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Track material costs, supplier spending, and pricing trends
        </p>
      </div>

      {/* Date Range Filter */}
      <Card className="border-zinc-800 bg-zinc-950">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Date Range</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <DollarSign className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-50">
              ${dashboard.total_spent.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {format(new Date(startDate), "MMM d")} -{" "}
              {format(new Date(endDate), "MMM d, yyyy")}
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suppliers</CardTitle>
            <Package className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-50">
              {dashboard.supplier_breakdown.length}
            </div>
            <p className="text-xs text-zinc-400 mt-1">Active suppliers</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-50">
              $
              {dashboard.supplier_breakdown.length > 0
                ? (
                    dashboard.supplier_breakdown.reduce(
                      (sum, s) => sum + s.avg_order_value,
                      0
                    ) / dashboard.supplier_breakdown.length
                  ).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "0.00"}
            </div>
            <p className="text-xs text-zinc-400 mt-1">Per order</p>
          </CardContent>
        </Card>
      </div>

      {/* Supplier Breakdown */}
      <Card className="border-zinc-800 bg-zinc-950">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Supplier Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.supplier_breakdown.length === 0 ? (
            <p className="text-zinc-400 text-sm text-center py-8">
              No spending data for this period
            </p>
          ) : (
            <div className="space-y-4">
              {dashboard.supplier_breakdown
                .sort((a, b) => b.total_spent - a.total_spent)
                .map((supplier) => (
                  <div
                    key={supplier.supplier_id}
                    className="flex items-center justify-between p-4 border border-zinc-800 rounded-lg"
                  >
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-zinc-50">
                        {supplier.supplier_name}
                      </h3>
                      <div className="flex gap-4 mt-1 text-xs text-zinc-400">
                        <span>{supplier.total_orders} orders</span>
                        <span>
                          Avg: $
                          {supplier.avg_order_value.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-zinc-50">
                        $
                        {supplier.total_spent.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {(
                          (supplier.total_spent / dashboard.total_spent) *
                          100
                        ).toFixed(1)}
                        % of total
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}































