"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { CashflowForecastChart } from "./CashflowForecastChart";

type CashflowForecastData = {
  workspace_id: string;
  days: number;
  start_date: string;
  end_date: string;
  timeline: Record<
    string,
    {
      incoming: number;
      outgoing: number;
      net: number;
      cumulative?: number;
    }
  >;
  summary: {
    total_incoming: number;
    total_outgoing: number;
    total_net: number;
    min_daily_net: number;
    min_cumulative_balance: number;
    red_flag_days_count: number;
  };
  red_flag_days: Array<{
    day: string;
    net: number;
    incoming: number;
    outgoing: number;
  }>;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

export function CashflowForecastPanel({ workspaceId }: { workspaceId?: string }) {
  const [data, setData] = useState<CashflowForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(90);
  const [showCumulative, setShowCumulative] = useState(false);

  useEffect(() => {
    const fetchForecast = async () => {
      setLoading(true);
      setError(null);

      try {
        const url = new URL("/api/cashflow/forecast", window.location.origin);
        // workspaceId is optional - API will use current workspace if not provided
        if (workspaceId) {
          url.searchParams.set("workspace_id", workspaceId);
        }
        url.searchParams.set("days", days.toString());

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error("Failed to fetch cashflow forecast");
        }

        const result = await response.json();
        if (result.ok && result.forecast) {
          setData(result.forecast);
        } else {
          throw new Error(result.error || "Failed to load forecast");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load forecast");
      } finally {
        setLoading(false);
      }
    };

    fetchForecast();
  }, [workspaceId, days]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cashflow Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading forecast...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cashflow Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const { summary, red_flag_days } = data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold">Cashflow Forecast</CardTitle>
          <div className="flex gap-2">
            <Button
              variant={days === 30 ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(30)}
            >
              30 Days
            </Button>
            <Button
              variant={days === 60 ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(60)}
            >
              60 Days
            </Button>
            <Button
              variant={days === 90 ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(90)}
            >
              90 Days
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-lg border p-4 bg-green-50">
            <div className="flex items-center gap-2 text-green-700">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">Total Incoming</span>
            </div>
            <div className="text-2xl font-bold text-green-900 mt-1">
              {formatCurrency(summary.total_incoming)}
            </div>
          </div>

          <div className="rounded-lg border p-4 bg-orange-50">
            <div className="flex items-center gap-2 text-orange-700">
              <TrendingDown className="h-4 w-4" />
              <span className="text-sm font-medium">Total Outgoing</span>
            </div>
            <div className="text-2xl font-bold text-orange-900 mt-1">
              {formatCurrency(summary.total_outgoing)}
            </div>
          </div>

          <div
            className={`rounded-lg border p-4 ${
              summary.total_net >= 0 ? "bg-blue-50" : "bg-red-50"
            }`}
          >
            <div
              className={`flex items-center gap-2 ${
                summary.total_net >= 0 ? "text-blue-700" : "text-red-700"
              }`}
            >
              <DollarSign className="h-4 w-4" />
              <span className="text-sm font-medium">Net Cashflow</span>
            </div>
            <div
              className={`text-2xl font-bold mt-1 ${
                summary.total_net >= 0 ? "text-blue-900" : "text-red-900"
              }`}
            >
              {formatCurrency(summary.total_net)}
            </div>
          </div>

          <div className="rounded-lg border p-4 bg-gray-50">
            <div className="flex items-center gap-2 text-gray-700">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Risk Days</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {summary.red_flag_days_count}
            </div>
          </div>
        </div>

        {/* Red Flag Alert */}
        {red_flag_days.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold mb-2">
                ⚠ Negative cashflow predicted on {red_flag_days.length} day
                {red_flag_days.length !== 1 ? "s" : ""}
              </div>
              <div className="text-sm space-y-1">
                {red_flag_days.slice(0, 5).map((flag) => (
                  <div key={flag.day}>
                    <strong>{formatDate(flag.day)}:</strong> Net cashflow of{" "}
                    {formatCurrency(flag.net)} (Incoming: {formatCurrency(flag.incoming)}, Outgoing:{" "}
                    {formatCurrency(flag.outgoing)})
                  </div>
                ))}
                {red_flag_days.length > 5 && (
                  <div className="text-muted-foreground">
                    ...and {red_flag_days.length - 5} more day
                    {red_flag_days.length - 5 !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
              <div className="mt-3 text-sm font-medium">
                Recommendation: Review deposits & job scheduling to avoid cashflow gaps.
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Chart */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Forecast Timeline</h3>
            <Button
              variant={showCumulative ? "default" : "outline"}
              size="sm"
              onClick={() => setShowCumulative(!showCumulative)}
            >
              {showCumulative ? "Hide" : "Show"} Cumulative Balance
            </Button>
          </div>
          <CashflowForecastChart data={data} showCumulative={showCumulative} />
        </div>

        {/* Forecast Period */}
        <div className="text-sm text-muted-foreground text-center">
          Forecast period: {formatDate(data.start_date)} to {formatDate(data.end_date)}
        </div>
      </CardContent>
    </Card>
  );
}



































