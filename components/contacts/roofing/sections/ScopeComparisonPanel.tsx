// Block 21080 — Scope Comparison Engine v2 UI Component
// Displays three-way comparison (Insurance vs SmartSend vs Market) with underpayment breakdown

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";

interface ScopeComparisonPanelProps {
  threadId: string;
}

interface ComparisonData {
  comparison_id: string;
  has_comparison: boolean;
  insurance_rcv: number;
  smartsend_estimate: number;
  market_value: number;
  difference_insurance_vs_smartsend: number;
  difference_insurance_vs_market: number;
  underpayment_amount: number;
  missing_items_total: number;
  underpriced_items_total: number;
  quantity_errors_total: number;
  o_and_p_missing_total: number;
  total_supplement_opportunity: number;
  line_item_comparisons: Array<{
    normalized_category: string;
    description: string;
    insurance_price: number;
    smartsend_price: number;
    market_price: number;
    difference_insurance_vs_smartsend: number;
    difference_insurance_vs_market: number;
    underpayment: number;
    qty: number;
    unit: string;
  }>;
  human_friendly_summary: {
    insurance_rcv: number;
    smartsend_estimate: number;
    market_value: number;
    insurance_underpayment: number;
    supplement_opportunity: number;
    where_insurance_missed: string[];
  };
  carrier_bias_detected: {
    carrier_name?: string;
    average_underpayment?: number;
    bias_patterns?: Array<{
      line_item: string;
      omission_rate: number;
      description: string;
    }>;
  };
  o_and_p: {
    included: boolean;
    should_be_included: boolean;
    missing_value: number;
    justification: string | null;
  };
}

export function ScopeComparisonPanel({ threadId }: ScopeComparisonPanelProps) {
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadComparison();
  }, [threadId]);

  const loadComparison = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/inbox/threads/${threadId}/scope-comparison`);
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Failed to load comparison");
        setComparison(null);
      } else {
        setComparison(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comparison");
      setComparison(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/inbox/threads/${threadId}/scope-comparison`, {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok) {
        await loadComparison();
      } else {
        setError(json?.error || "Failed to refresh comparison");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh comparison");
    } finally {
      setRefreshing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Scope Comparison (v2)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !comparison || !comparison.has_comparison) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Scope Comparison (v2)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              {error || "No scope comparison available"}
            </p>
            <Button onClick={handleRefresh} disabled={refreshing} size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Generate Comparison"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const summary = comparison.human_friendly_summary || {};
  const carrierBias = comparison.carrier_bias_detected || {};

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Scope Comparison (v2)
          </CardTitle>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Underpayment Summary */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="font-semibold text-red-900">Insurance Underpayment</h3>
          </div>
          <div className="text-3xl font-bold text-red-600 mb-2">
            {formatCurrency(comparison.underpayment_amount)}
          </div>
          <div className="text-sm text-red-700">
            Supplement Opportunity: {formatCurrency(comparison.total_supplement_opportunity)}
          </div>
        </div>

        {/* Three-Way Comparison Totals */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">Insurance RCV</div>
            <div className="text-lg font-semibold">{formatCurrency(comparison.insurance_rcv)}</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">SmartSend Estimate</div>
            <div className="text-lg font-semibold">{formatCurrency(comparison.smartsend_estimate)}</div>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">Market Value</div>
            <div className="text-lg font-semibold">{formatCurrency(comparison.market_value)}</div>
          </div>
        </div>

        {/* Underpayment Breakdown */}
        <div>
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Underpayment Breakdown
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm">Missing Items</span>
              <Badge variant="destructive">{formatCurrency(comparison.missing_items_total)}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Underpriced Items</span>
              <Badge variant="destructive">{formatCurrency(comparison.underpriced_items_total)}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Quantity Errors</span>
              <Badge variant="destructive">{formatCurrency(comparison.quantity_errors_total)}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">O&P Missing</span>
              <Badge variant="destructive">{formatCurrency(comparison.o_and_p_missing_total)}</Badge>
            </div>
            <div className="border-t pt-2 mt-2 flex justify-between items-center font-semibold">
              <span>Total Underpayment</span>
              <Badge variant="destructive" className="text-base">
                {formatCurrency(comparison.underpayment_amount)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Major Differences */}
        {summary.where_insurance_missed && summary.where_insurance_missed.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Where Insurance Missed Money
            </h4>
            <ul className="space-y-1">
              {summary.where_insurance_missed.map((item: string, idx: number) => (
                <li key={idx} className="text-sm flex items-center gap-2">
                  <XCircle className="h-3 w-3 text-red-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Line Item Comparisons */}
        {comparison.line_item_comparisons && comparison.line_item_comparisons.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3">Line Item Comparison</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {comparison.line_item_comparisons
                .filter((item) => item.underpayment > 0)
                .slice(0, 5)
                .map((item, idx) => (
                  <div
                    key={idx}
                    className="border rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-sm capitalize">
                        {item.description || item.normalized_category.replace(/_/g, " ")}
                      </div>
                      <Badge variant={item.underpayment > 100 ? "destructive" : "secondary"}>
                        {formatCurrency(item.underpayment)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <div>
                        <span className="font-medium">Insurance:</span> {formatCurrency(item.insurance_price)}
                      </div>
                      <div>
                        <span className="font-medium">SmartSend:</span> {formatCurrency(item.smartsend_price)}
                      </div>
                      <div>
                        <span className="font-medium">Market:</span> {formatCurrency(item.market_price)}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Carrier Bias Detection */}
        {carrierBias.carrier_name && carrierBias.bias_patterns && carrierBias.bias_patterns.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Insurance Bias Pattern ({carrierBias.carrier_name})
            </h4>
            <p className="text-sm text-muted-foreground mb-3">
              Average underpayment: {formatCurrency(carrierBias.average_underpayment || 0)}
            </p>
            <div className="space-y-1">
              {carrierBias.bias_patterns.slice(0, 3).map((pattern: any, idx: number) => (
                <div key={idx} className="text-sm">
                  <span className="font-medium capitalize">{pattern.line_item.replace(/_/g, " ")}:</span>{" "}
                  {pattern.description}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* O&P Status */}
        {comparison.o_and_p && (
          <div className={`border rounded-lg p-3 ${comparison.o_and_p.should_be_included && !comparison.o_and_p.included ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
            <div className="flex items-center gap-2 mb-2">
              {comparison.o_and_p.should_be_included && !comparison.o_and_p.included ? (
                <XCircle className="h-4 w-4 text-red-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
              <span className="font-semibold text-sm">
                Overhead & Profit (O&P)
              </span>
            </div>
            {comparison.o_and_p.should_be_included && !comparison.o_and_p.included && (
              <div className="text-sm text-red-700">
                <div className="mb-1">Missing Value: {formatCurrency(comparison.o_and_p.missing_value)}</div>
                {comparison.o_and_p.justification && (
                  <div className="text-xs text-muted-foreground">{comparison.o_and_p.justification}</div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
















































