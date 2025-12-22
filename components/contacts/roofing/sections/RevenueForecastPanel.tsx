// Block 21260 — SmartSend Revenue Forecast Brain v1 UI Component
// Displays RCV, Supplement, Upsell, Install Probability, and TRUE Job Value

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Info,
  Zap,
  Target,
} from "lucide-react";

interface RevenueForecastPanelProps {
  data: {
    rcvRevenue?: number | null;
    supplementRevenue?: number | null;
    upsellRevenue?: number | null;
    installProbability?: number | null;
    installProbabilityCategory?: string | null;
    trueJobValue?: number | null;
    supplementBreakdown?: any;
    supplementInsights?: Array<{
      type: string;
      value: number;
      description: string;
    }>;
    upsellBreakdown?: any;
    upsellInsights?: Array<{
      type: string;
      value: number;
      description: string;
      probability?: number;
    }>;
    installProbabilityBreakdown?: any;
    installProbabilitySignals?: Array<{
      type: string;
      points: number;
      description: string;
    }>;
    calculatedAt?: string;
  } | null;
  contactId: string;
  onRecalculate?: () => void;
}

export function RevenueForecastPanel({
  data,
  contactId,
  onRecalculate,
}: RevenueForecastPanelProps) {
  const [recalculating, setRecalculating] = useState(false);

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "$0";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "0%";
    return `${Math.round(value)}%`;
  };

  const getProbabilityColor = (category: string | null | undefined) => {
    switch (category) {
      case "very_hot":
        return "bg-red-100 text-red-800 border-red-300";
      case "hot":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "warm":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "cold":
        return "bg-gray-100 text-gray-800 border-gray-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getProbabilityLabel = (category: string | null | undefined) => {
    switch (category) {
      case "very_hot":
        return "Very Likely";
      case "hot":
        return "Hot";
      case "warm":
        return "Warm";
      case "cold":
        return "Cold";
      default:
        return "Unknown";
    }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/revenue-forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRecalculate: true }),
      });
      if (res.ok && onRecalculate) {
        onRecalculate();
      }
    } catch (error) {
      console.error("Error recalculating forecast:", error);
    } finally {
      setRecalculating(false);
    }
  };

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Revenue Forecast (SmartSend v1)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No revenue forecast data available</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={handleRecalculate}
              disabled={recalculating}
            >
              {recalculating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Calculate Forecast
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData =
    data.rcvRevenue !== null &&
    data.rcvRevenue !== undefined &&
    (data.supplementRevenue !== null ||
      data.upsellRevenue !== null ||
      data.installProbability !== null);

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Revenue Forecast (SmartSend v1)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Insufficient data to calculate forecast</p>
            <p className="text-sm mt-2">
              Need insurance RCV or scope comparison data
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-blue-200">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-blue-600" />
            Revenue Forecast (SmartSend v1)
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRecalculate}
            disabled={recalculating}
          >
            <RefreshCw
              className={`h-4 w-4 ${recalculating ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {/* Main Revenue Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* RCV Revenue */}
          <div className="border rounded-lg p-4 bg-blue-50">
            <div className="text-sm text-muted-foreground mb-1">
              Insurance RCV
            </div>
            <div className="text-2xl font-bold text-blue-700">
              {formatCurrency(data.rcvRevenue)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Base job value
            </div>
          </div>

          {/* Supplement Revenue */}
          {data.supplementRevenue && data.supplementRevenue > 0 && (
            <div className="border rounded-lg p-4 bg-green-50">
              <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Supplement Estimate
              </div>
              <div className="text-2xl font-bold text-green-700">
                +{formatCurrency(data.supplementRevenue)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Expected add-ons
              </div>
            </div>
          )}

          {/* Upsell Revenue */}
          {data.upsellRevenue && data.upsellRevenue > 0 && (
            <div className="border rounded-lg p-4 bg-purple-50">
              <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <Target className="h-3 w-3" />
                Upsell Estimate
              </div>
              <div className="text-2xl font-bold text-purple-700">
                +{formatCurrency(data.upsellRevenue)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Add-ons potential
              </div>
            </div>
          )}
        </div>

        {/* TRUE Job Value */}
        {data.trueJobValue && (
          <div className="border-2 border-blue-300 rounded-lg p-6 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-600" />
                  TRUE Job Value
                </div>
                <div className="text-3xl font-bold text-blue-700">
                  {formatCurrency(data.trueJobValue)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Actual money you'll make when closed
                </div>
              </div>
              {data.installProbability !== null &&
                data.installProbability !== undefined && (
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground mb-1">
                      Install Probability
                    </div>
                    <Badge
                      className={`text-lg px-4 py-2 ${getProbabilityColor(
                        data.installProbabilityCategory
                      )}`}
                    >
                      {formatPercent(data.installProbability)} (
                      {getProbabilityLabel(data.installProbabilityCategory)})
                    </Badge>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Key Insights */}
        <div className="space-y-4">
          {/* Supplement Insights */}
          {data.supplementInsights &&
            data.supplementInsights.length > 0 && (
              <div className="border rounded-lg p-4 bg-green-50">
                <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Supplement Opportunities
                </div>
                <div className="space-y-2">
                  {data.supplementInsights.map((insight, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-sm"
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="flex-1">
                        {insight.description}:{" "}
                        <span className="font-semibold text-green-700">
                          +{formatCurrency(insight.value)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Upsell Insights */}
          {data.upsellInsights && data.upsellInsights.length > 0 && (
            <div className="border rounded-lg p-4 bg-purple-50">
              <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Target className="h-4 w-4 text-purple-600" />
                Upsell Opportunities
              </div>
              <div className="space-y-2">
                {data.upsellInsights.map((insight, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-sm"
                  >
                    <AlertCircle className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                    <span className="flex-1">
                      {insight.description}
                      {insight.probability && (
                        <span className="text-muted-foreground ml-2">
                          ({formatPercent(insight.probability * 100)} chance)
                        </span>
                      )}
                      :{" "}
                      <span className="font-semibold text-purple-700">
                        +{formatCurrency(insight.value)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Install Probability Signals */}
          {data.installProbabilitySignals &&
            data.installProbabilitySignals.length > 0 && (
              <div className="border rounded-lg p-4 bg-yellow-50">
                <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-600" />
                  Why This Score?
                </div>
                <div className="space-y-2">
                  {data.installProbabilitySignals.map((signal, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-sm"
                    >
                      <Info className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <span className="flex-1">
                        {signal.description}
                        {signal.points > 0 && (
                          <span className="text-muted-foreground ml-2">
                            (+{signal.points} pts)
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>

        {/* Calculated At */}
        {data.calculatedAt && (
          <div className="text-xs text-muted-foreground text-center pt-2 border-t">
            Calculated: {new Date(data.calculatedAt).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
















































