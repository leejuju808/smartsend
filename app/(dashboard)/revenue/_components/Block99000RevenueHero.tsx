"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Package, Target, Zap } from "lucide-react";

type Block99000Data = {
  totalRevenueThisMonth: number;
  totalRevenueLastMonth: number;
  pipelineValue: number;
  pipelineCount: number;
  revenueByCampaign: Array<{
    campaignId: string;
    campaignName: string;
    leadsCount: number;
    jobsWonCount: number;
    revenueWon: number;
    avgJobValue: number;
  }>;
  revenueBySource: Array<{
    source: string;
    revenue: number;
  }>;
  smartSendMonthlyCost: number;
  roi: number;
  roiMultiplier: number;
  roiMessage: string;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export function Block99000RevenueHero({ data }: { data: Block99000Data }) {
  const revenueChange = data.totalRevenueLastMonth > 0
    ? ((data.totalRevenueThisMonth - data.totalRevenueLastMonth) / data.totalRevenueLastMonth) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Hero Section: Total Revenue Generated */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* This Month Revenue */}
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-emerald-900">
              💰 This Month
            </CardTitle>
            <DollarSign className="h-5 w-5 text-emerald-700" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-900">
              {formatCurrency(data.totalRevenueThisMonth)}
            </div>
            {data.totalRevenueLastMonth > 0 && (
              <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                {revenueChange >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingUp className="h-3 w-3 rotate-180" />
                )}
                {revenueChange >= 0 ? "+" : ""}
                {revenueChange.toFixed(1)}% vs last month ({formatCurrency(data.totalRevenueLastMonth)})
              </p>
            )}
          </CardContent>
        </Card>

        {/* Pipeline Value */}
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-900">
              📦 Pipeline Value
            </CardTitle>
            <Package className="h-5 w-5 text-blue-700" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900">
              {formatCurrency(data.pipelineValue)}
            </div>
            <p className="text-xs text-blue-700 mt-1">
              {data.pipelineCount} estimates outstanding
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ROI Section - The Retention Killer */}
      <Card className="bg-gradient-to-r from-purple-500/10 via-purple-400/5 to-transparent border-purple-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-purple-600" />
            ROI: The Retention Engine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-sm text-muted-foreground">SmartSend Cost</div>
              <div className="text-2xl font-bold">{formatCurrency(data.smartSendMonthlyCost)}/mo</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Revenue Generated</div>
              <div className="text-2xl font-bold text-emerald-600">
                {formatCurrency(data.totalRevenueThisMonth)}/mo
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">ROI</div>
              <div className="text-2xl font-bold text-purple-600">
                {data.roi.toFixed(0)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data.roiMessage}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Revenue by Campaign */}
      {data.revenueByCampaign.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Money Per Campaign
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.revenueByCampaign.map((campaign) => (
                <div
                  key={campaign.campaignId}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium">{campaign.campaignName}</div>
                    <div className="text-sm text-muted-foreground">
                      {campaign.leadsCount} leads • {campaign.jobsWonCount} jobs won
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">
                      {formatCurrency(campaign.revenueWon)}
                    </div>
                    {campaign.avgJobValue > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Avg: {formatCurrency(campaign.avgJobValue)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenue by Lead Source */}
      {data.revenueBySource.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Money Per Lead Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.revenueBySource.map((source) => (
                <div
                  key={source.source}
                  className="flex items-center justify-between p-2 bg-muted/30 rounded"
                >
                  <span className="text-sm font-medium capitalize">
                    {source.source.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm font-bold">
                    {formatCurrency(source.revenue)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


























