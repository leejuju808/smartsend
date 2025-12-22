"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, Users, Flame } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface RevenueMetrics {
  today_revenue: number;
  week_revenue: number;
  month_revenue: number;
  active_leads_count: number;
  hot_lead_value: number;
}

interface RevenueMetricsPanelProps {
  campaignId: string;
}

export function RevenueMetricsPanel({ campaignId }: RevenueMetricsPanelProps) {
  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch(
          `/api/inbox/revenue/metrics?campaign_id=${campaignId}`
        );
        if (response.ok) {
          const data = await response.json();
          setMetrics(data);
        }
      } catch (error) {
        console.error("Error fetching revenue metrics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    // Refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [campaignId]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-3">
            <div className="h-12 bg-gray-200 animate-pulse rounded" />
          </Card>
        ))}
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
      <Card className="p-3 border-l-4 border-l-green-500">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="w-4 h-4 text-green-600" />
          <span className="text-xs text-gray-600 font-medium">Today&apos;s Revenue</span>
        </div>
        <div className="text-lg font-bold text-gray-900">
          {formatCurrency(metrics.today_revenue)}
        </div>
      </Card>

      <Card className="p-3 border-l-4 border-l-blue-500">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          <span className="text-xs text-gray-600 font-medium">This Week</span>
        </div>
        <div className="text-lg font-bold text-gray-900">
          {formatCurrency(metrics.week_revenue)}
        </div>
      </Card>

      <Card className="p-3 border-l-4 border-l-purple-500">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="w-4 h-4 text-purple-600" />
          <span className="text-xs text-gray-600 font-medium">Month-to-Date</span>
        </div>
        <div className="text-lg font-bold text-gray-900">
          {formatCurrency(metrics.month_revenue)}
        </div>
      </Card>

      <Card className="p-3 border-l-4 border-l-orange-500">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-4 h-4 text-orange-600" />
          <span className="text-xs text-gray-600 font-medium">Leads Active</span>
        </div>
        <div className="text-lg font-bold text-gray-900">
          {metrics.active_leads_count}
        </div>
      </Card>

      <Card className="p-3 border-l-4 border-l-red-500">
        <div className="flex items-center gap-2 mb-1">
          <Flame className="w-4 h-4 text-red-600" />
          <span className="text-xs text-gray-600 font-medium">Hot Lead Value</span>
        </div>
        <div className="text-lg font-bold text-gray-900">
          {formatCurrency(metrics.hot_lead_value)}
        </div>
      </Card>
    </div>
  );
}



















































