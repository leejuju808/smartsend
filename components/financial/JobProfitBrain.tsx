"use client";

import * as React from "react";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/badge";
import { AlertTriangle, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

interface JobFinancials {
  contract_price: number;
  estimated_cost: number;
  actual_cost: number;
  material_cost: number;
  labor_cost: number;
  sub_cost: number;
  overhead_allocated: number;
  gross_profit: number;
  margin: number;
  cost_variance: number;
  variance_percentage: number;
}

interface JobProfitBrainProps {
  jobId: string;
  financials?: JobFinancials | null;
  onRefresh?: () => void;
}

/**
 * Block 254200: Real-Time Job Profit Brain
 * Shows live profitability for each job
 */
export function JobProfitBrain({ jobId, financials, onRefresh }: JobProfitBrainProps) {
  const [loading, setLoading] = React.useState(false);

  if (!financials) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          No financial data available. Calculating...
        </div>
      </Card>
    );
  }

  const isProfitable = financials.gross_profit > 0;
  const isOverrun = financials.variance_percentage > 10;
  const marginColor = financials.margin >= 30 ? "text-green-600" : 
                     financials.margin >= 20 ? "text-yellow-600" : "text-red-600";

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Real-Time Job Profit</h3>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Refresh
          </button>
        )}
      </div>

      {/* Contract Price */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Contract Price</span>
        </div>
        <div className="text-2xl font-bold">${financials.contract_price.toLocaleString()}</div>
      </div>

      {/* Cost Breakdown */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Material Cost</span>
          <span>${financials.material_cost.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Labor Cost</span>
          <span>${financials.labor_cost.toLocaleString()}</span>
        </div>
        {financials.sub_cost > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Sub Cost</span>
            <span>${financials.sub_cost.toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Overhead Allocated</span>
          <span>${financials.overhead_allocated.toLocaleString()}</span>
        </div>
        <div className="border-t pt-2 mt-2">
          <div className="flex justify-between font-semibold">
            <span>Total Cost</span>
            <span>${financials.actual_cost.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Profit & Margin */}
      <div className="border-t pt-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Gross Profit</span>
          <div className="flex items-center gap-2">
            {isProfitable ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
            <span className={`text-xl font-bold ${isProfitable ? "text-green-600" : "text-red-600"}`}>
              ${financials.gross_profit.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Margin</span>
          <Badge variant={financials.margin >= 30 ? "default" : financials.margin >= 20 ? "secondary" : "destructive"}>
            {financials.margin.toFixed(1)}%
          </Badge>
        </div>
      </div>

      {/* Variance Alert */}
      {isOverrun && (
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Cost Overrun Detected</span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Actual cost is {Math.abs(financials.variance_percentage).toFixed(1)}% over estimate
            (${Math.abs(financials.cost_variance).toLocaleString()})
          </div>
        </div>
      )}
    </Card>
  );
}






















