// Section 1 — Today's Money Metrics

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown, Users, Target } from "lucide-react";

interface HeaderSectionProps {
  forecast: {
    revenue_forecast: number;
    jobs_expected_to_close: number;
    new_leads: number;
    jobs_won: number;
    jobs_lost: number;
    revenue_leakage: number;
  };
}

export function HeaderSection({ forecast }: HeaderSectionProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-white">Today's Money Metrics</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Revenue Forecast */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Revenue Forecast</CardTitle>
            <DollarSign className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{formatCurrency(forecast.revenue_forecast)}</div>
            <p className="text-xs text-gray-400 mt-1">Weighted forecast</p>
          </CardContent>
        </Card>

        {/* Jobs Expected to Close */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Expected Closes</CardTitle>
            <Target className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{forecast.jobs_expected_to_close}</div>
            <p className="text-xs text-gray-400 mt-1">Jobs expected today</p>
          </CardContent>
        </Card>

        {/* New Leads */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">New Leads</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{forecast.new_leads}</div>
            <p className="text-xs text-gray-400 mt-1">Leads added today</p>
          </CardContent>
        </Card>

        {/* Jobs Won */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Jobs Won</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">{forecast.jobs_won}</div>
            <p className="text-xs text-gray-400 mt-1">Closed today</p>
          </CardContent>
        </Card>

        {/* Jobs Lost */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Jobs Lost</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">{forecast.jobs_lost}</div>
            <p className="text-xs text-gray-400 mt-1">Lost today</p>
          </CardContent>
        </Card>

        {/* Revenue Leakage */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Revenue Leakage</CardTitle>
            <DollarSign className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">{formatCurrency(forecast.revenue_leakage)}</div>
            <p className="text-xs text-gray-400 mt-1">Lost revenue today</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}









































