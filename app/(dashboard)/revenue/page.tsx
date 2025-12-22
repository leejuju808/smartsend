"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RevenueKPICards } from "./_components/RevenueKPICards";
import { RevenueFunnel } from "./_components/RevenueFunnel";
import { RevenueOverTimeChart } from "./_components/RevenueOverTimeChart";
import { CampaignRevenueTable } from "./_components/CampaignRevenueTable";
import { PipelineValueSnapshot } from "./_components/PipelineValueSnapshot";
import { Block99000RevenueHero } from "./_components/Block99000RevenueHero";
import { Loader2 } from "lucide-react";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { getFeatures } from "@/lib/billing/feature-gates";
import { useUpgradeGate } from "@/hooks/useUpgradeGate";
import { UpgradeModal } from "@/components/UpgradeModal";

type RevenueDashboardData = {
  kpis: {
    jobsWon: number;
    revenueWon: number;
    avgJobValue: number | null;
    leads: number;
    inspections: number;
    estimates: number;
    closeRateEstimates: number;
    closeRateLeads: number;
    pipelineValue: {
      estimateTotal: number;
      jobsWonFuture: number;
    };
  };
  funnel: {
    newLeads: number;
    inspections: number;
    estimates: number;
    jobsWon: number;
  };
  revenueOverTime: Array<{
    date: string;
    revenue: number;
  }>;
  campaigns: Array<{
    campaignId: string;
    campaignName: string;
    leads: number;
    jobsWon: number;
    revenueWon: number;
    avgJobValue: number | null;
    closeRate: number;
  }>;
  block99000?: {
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
};

export default function RevenueDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<RevenueDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<string>(
    searchParams.get("range") || "30d"
  );
  const [campaignId, setCampaignId] = useState<string | null>(
    searchParams.get("campaignId") || null
  );
  
  // Block 16700: Upgrade Wall - Check if revenue dashboard is locked
  const { workspace, loading: workspaceLoading } = useCurrentWorkspace();
  const { upgradeReason, requireUpgrade, close } = useUpgradeGate();
  
  const features = workspace ? getFeatures(workspace.plan_key as any) : null;
  const isLocked = features && !features.revenueDashboard;

  // Calculate date range
  const getDateRange = (range: string) => {
    const end = new Date();
    const start = new Date();
    
    switch (range) {
      case "7d":
        start.setDate(start.getDate() - 7);
        break;
      case "30d":
        start.setDate(start.getDate() - 30);
        break;
      case "90d":
        start.setDate(start.getDate() - 90);
        break;
      case "year":
        start.setFullYear(start.getFullYear() - 1);
        break;
      default:
        start.setDate(start.getDate() - 30);
    }
    
    return { start, end };
  };

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      const { start, end } = getDateRange(dateRange);
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
      });
      
      if (campaignId) {
        params.set("campaignId", campaignId);
      }
      
      try {
        const response = await fetch(`/api/revenue/dashboard?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Failed to fetch revenue data");
        }
        const result = await response.json();
        // Handle both old format (result.dashboard) and new format (result directly)
        if (result.dashboard) {
          setData({
            ...result.dashboard,
            block99000: result.block99000 || result.dashboard.block99000,
          });
        } else {
          setData(result);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [dateRange, campaignId]);

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (dateRange !== "30d") params.set("range", dateRange);
    if (campaignId) params.set("campaignId", campaignId);
    router.replace(`/revenue?${params.toString()}`, { scroll: false });
  }, [dateRange, campaignId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">{error}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6 p-6 relative">
      {/* Block 16700: Upgrade Wall - Revenue Dashboard Lock */}
      {isLocked && (
        <div className="absolute inset-0 backdrop-blur-lg bg-white/70 flex items-center justify-center z-10 rounded-lg">
          <div className="text-center space-y-3">
            <div className="text-lg font-bold">Revenue Dashboard</div>
            <div className="text-sm text-gray-600">
              Unlock revenue tracking, pipeline metrics, and campaign attribution with Domination plan.
            </div>
            <button
              onClick={() => requireUpgrade("feature_locked")}
              className="text-xs px-3 py-2 rounded-xl bg-black text-white hover:bg-gray-800 transition-colors"
            >
              Upgrade to Domination
            </button>
          </div>
        </div>
      )}
      
      {upgradeReason && workspace && (
        <UpgradeModal 
          open={!!upgradeReason} 
          onClose={close} 
          reason={upgradeReason}
          currentTier={(workspace.plan_key as any) || "starter"}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Revenue Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track job value, pipeline metrics, and revenue attribution
          </p>
        </div>
      </div>

      {/* Block 99000: Revenue Hero - The Money View */}
      {data.block99000 && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">💰 SmartSend Revenue Engine</h2>
            <p className="text-sm text-muted-foreground">
              See exactly how much money SmartSend is making you
            </p>
          </div>
          <Block99000RevenueHero data={data.block99000} />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Date Range:</label>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="year">This year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Campaign:</label>
          <Select value={campaignId || "all"} onValueChange={(v) => setCampaignId(v === "all" ? null : v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {/* Campaign options would be loaded separately if needed */}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <RevenueKPICards kpis={data.kpis} />

      {/* Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueFunnel funnel={data.funnel} />
        </CardContent>
      </Card>

      {/* Charts and Tables Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueOverTimeChart data={data.revenueOverTime} />
          </CardContent>
        </Card>

        {/* Pipeline Value Snapshot */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Value Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineValueSnapshot pipelineValue={data.kpis.pipelineValue} />
          </CardContent>
        </Card>
      </div>

      {/* Campaign Revenue Table */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Revenue Attribution</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignRevenueTable campaigns={data.campaigns} />
        </CardContent>
      </Card>
    </div>
  );
}


