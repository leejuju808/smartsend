"use client";

// Block 26640 — SmartSend Roofing Deal Convert Predictor v1
// Deals to Win This Month Page
// Shows deals ranked by expected profit with win probability and follow-up priority

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, DollarSign, Target, AlertCircle } from "lucide-react";

type DealPriority = {
  job_id: string;
  workspace_id: string;
  homeowner_name: string | null;
  address: string | null;
  status: string;
  estimated_value: number | null;
  win_probability: number | null;
  expected_revenue: number | null;
  expected_profit: number | null;
  follow_up_priority: "low" | "medium" | "high" | null;
  confidence_level: "low" | "medium" | "high" | null;
  reason_summary: string | null;
  prediction_updated_at: string | null;
};

export default function DealsPage() {
  const [deals, setDeals] = useState<DealPriority[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDeals();
  }, []);

  const fetchDeals = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/deals-priority");

      if (!response.ok) {
        throw new Error("Failed to fetch deals");
      }

      const result = await response.json();
      setDeals(result.deals || []);
    } catch (err: any) {
      setError(err.message || "Failed to load deals");
      console.error("Error fetching deals:", err);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityBadgeColor = (priority: string | null) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800 border-red-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "low":
        return "bg-gray-100 text-gray-800 border-gray-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getWinProbabilityColor = (probability: number | null) => {
    if (!probability) return "text-gray-500";
    if (probability >= 70) return "text-green-600 font-bold";
    if (probability >= 40) return "text-yellow-600";
    return "text-gray-500";
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return "$0";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  };

  // Calculate totals
  const totalExpectedRevenue = deals.reduce((sum, d) => sum + (d.expected_revenue || 0), 0);
  const totalExpectedProfit = deals.reduce((sum, d) => sum + (d.expected_profit || 0), 0);
  const highPriorityCount = deals.filter((d) => d.follow_up_priority === "high").length;
  const highWinProbabilityCount = deals.filter((d) => (d.win_probability || 0) >= 70).length;

  if (loading && deals.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deals to Win</h1>
          <p className="text-sm text-muted-foreground mt-1">
            SmartSend predicts which jobs are most likely to close and where to focus your follow-up.
          </p>
        </div>
        <Button onClick={fetchDeals} variant="outline" size="sm" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Refreshing...
            </>
          ) : (
            "Refresh"
          )}
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats Summary */}
      {deals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Expected Revenue</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(totalExpectedRevenue)}
                  </p>
                </div>
                <div className="text-3xl">
                  <DollarSign className="h-8 w-8 text-gray-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Expected Profit</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatCurrency(totalExpectedProfit)}
                  </p>
                </div>
                <div className="text-3xl">
                  <TrendingUp className="h-8 w-8 text-gray-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">High Priority</p>
                  <p className="text-2xl font-bold text-red-600">{highPriorityCount}</p>
                </div>
                <div className="text-3xl">
                  <AlertCircle className="h-8 w-8 text-gray-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">High Win %</p>
                  <p className="text-2xl font-bold text-green-600">{highWinProbabilityCount}</p>
                </div>
                <div className="text-3xl">
                  <Target className="h-8 w-8 text-gray-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Deals Table */}
      <Card>
        <CardHeader>
          <CardTitle>Deals Priority Queue</CardTitle>
          <CardDescription>
            Deals ranked by expected profit (highest value first)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No deals found. Deals will appear here once predictions are generated.</p>
              <p className="text-sm mt-2">
                Predictions are generated when jobs move stages or leads reply.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-3 font-medium text-muted-foreground">Job</th>
                    <th className="p-3 font-medium text-muted-foreground">Status</th>
                    <th className="p-3 font-medium text-muted-foreground text-right">
                      Est. Value
                    </th>
                    <th className="p-3 font-medium text-muted-foreground text-right">Win %</th>
                    <th className="p-3 font-medium text-muted-foreground text-right">
                      Expected Rev
                    </th>
                    <th className="p-3 font-medium text-muted-foreground text-right">
                      Expected Profit
                    </th>
                    <th className="p-3 font-medium text-muted-foreground">Priority</th>
                    <th className="p-3 font-medium text-muted-foreground">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal) => (
                    <tr
                      key={deal.job_id}
                      className="border-b hover:bg-muted/50 transition-colors"
                    >
                      <td className="p-3">
                        <div className="font-medium">
                          {deal.homeowner_name || "Unknown"}
                        </div>
                        {deal.address && (
                          <div className="text-xs text-muted-foreground">{deal.address}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">{deal.status}</Badge>
                      </td>
                      <td className="p-3 text-right font-medium">
                        {formatCurrency(deal.estimated_value)}
                      </td>
                      <td className={`p-3 text-right ${getWinProbabilityColor(deal.win_probability)}`}>
                        {deal.win_probability !== null ? `${deal.win_probability}%` : "—"}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {formatCurrency(deal.expected_revenue)}
                      </td>
                      <td className="p-3 text-right font-bold text-blue-600">
                        {formatCurrency(deal.expected_profit)}
                      </td>
                      <td className="p-3">
                        {deal.follow_up_priority ? (
                          <Badge
                            className={`${getPriorityBadgeColor(deal.follow_up_priority)} font-bold`}
                          >
                            {deal.follow_up_priority.toUpperCase()}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 max-w-xs">
                        <div
                          className="truncate text-muted-foreground"
                          title={deal.reason_summary || ""}
                        >
                          {deal.reason_summary || "—"}
                        </div>
                        {deal.prediction_updated_at && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Updated {formatDate(deal.prediction_updated_at)}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



































