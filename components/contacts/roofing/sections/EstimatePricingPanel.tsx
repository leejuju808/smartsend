// Block 20710 — Estimate + Pricing Panel (from Block 20490)

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, AlertCircle } from "lucide-react";

interface EstimatePricingPanelProps {
  data: {
    baseRatePerSq: number | null;
    totalEstimate: number | null;
    supplementValue: number | null;
    insuranceRcv: number | null;
    insuranceAcv: number | null;
    priceComparison: {
      estimate: number;
      rcv: number;
      difference: number;
    } | null;
  };
}

export function EstimatePricingPanel({ data }: EstimatePricingPanelProps) {
  const formatCurrency = (amount: number | null) => {
    if (!amount) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (!data.totalEstimate && !data.insuranceRcv) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Estimate (SmartSend AI)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No estimate available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Estimate (SmartSend AI)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total Estimate */}
        {data.totalEstimate && (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold">{formatCurrency(data.totalEstimate)}</span>
            </div>
          </div>
        )}

        {/* Base Rate */}
        {data.baseRatePerSq && (
          <div className="text-sm">
            <span className="text-muted-foreground">Base Rate: </span>
            <span className="font-medium">{formatCurrency(data.baseRatePerSq)}/SQ</span>
          </div>
        )}

        {/* Insurance RCV Comparison */}
        {data.insuranceRcv && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">RCV</span>
              <span className="text-lg font-medium text-green-700">
                {formatCurrency(data.insuranceRcv)}
              </span>
            </div>
          </div>
        )}

        {/* Price Comparison */}
        {data.priceComparison && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Price Comparison</span>
              {data.priceComparison.difference > 0 ? (
                <Badge className="bg-orange-100 text-orange-700 border-orange-300 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  ${Math.abs(data.priceComparison.difference).toLocaleString()} over RCV
                </Badge>
              ) : (
                <Badge className="bg-green-100 text-green-700 border-green-300 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  ${Math.abs(data.priceComparison.difference).toLocaleString()} under RCV
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Estimate: {formatCurrency(data.priceComparison.estimate)} vs RCV:{" "}
              {formatCurrency(data.priceComparison.rcv)}
            </div>
          </div>
        )}

        {/* Supplement Value */}
        {data.supplementValue && data.supplementValue > 0 && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-orange-700">Supplements</span>
              <span className="text-lg font-bold text-orange-700">
                {formatCurrency(data.supplementValue)}+ potential
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
















































