"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClientComponentClient } from "@/lib/supabase";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import Link from "next/link";

type OwnerDashboardData = {
  monthlyRevenue: number;
  profitMargin: number;
  hotLeadsCount: number;
  jobsAtRisk: number;
  avgDaysToComplete: number;
  materialWasteTrends: {
    highWasteJobs: number;
    totalJobsTracked: number;
  };
  weatherImpactScore: number;
  supplierPerformance: {
    issuesCount: number;
  };
  crewEfficiency: {
    avgHours: number;
    jobsTracked: number;
  };
  insurancePayoutSpeed: {
    avgDays: number;
  };
  topSalesReps: Array<{
    repEmail: string;
    totalRevenue: number;
    winRate: number;
  }>;
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function RoofingAnalyticsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<OwnerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const activeWorkspace = typeof window !== "undefined" 
          ? localStorage.getItem('active_workspace') 
          : null;
        
        if (activeWorkspace) {
          setWorkspaceId(activeWorkspace);
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: workspace } = await supabase
              .from('workspace_members')
              .select('workspace_id')
              .eq('user_id', user.id)
              .limit(1)
              .maybeSingle();
            
            if (workspace) {
              setWorkspaceId(workspace.workspace_id);
            }
          }
        }
      } catch (error) {
        console.error('Error loading workspace:', error);
        setLoading(false);
      }
    };

    loadWorkspace();
  }, [supabase]);

  useEffect(() => {
    if (!workspaceId) return;

    const loadDashboard = async () => {
      try {
        const res = await fetch(`/api/analytics/owner?workspaceId=${workspaceId}`);
        const data = await res.json();
        setDashboardData(data);
      } catch (error) {
        console.error("Error loading dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading analytics...</div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">No analytics data available.</div>
      </div>
    );
  }

  const salesRepsData = dashboardData.topSalesReps.map((rep) => ({
    name: rep.repEmail.split('@')[0],
    revenue: rep.totalRevenue,
    winRate: rep.winRate,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Roofing Analytics Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/dashboard/analytics/roofing/leads">
            <button className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md">
              Lead Reports
            </button>
          </Link>
          <Link href="/dashboard/analytics/roofing/jobs">
            <button className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md">
              Job Reports
            </button>
          </Link>
          <Link href="/dashboard/analytics/roofing/team">
            <button className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md">
              Team Performance
            </button>
          </Link>
          <Link href="/dashboard/analytics/roofing/marketing">
            <button className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md">
              Outreach ROI
            </button>
          </Link>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(dashboardData.monthlyRevenue / 1000).toFixed(1)}K
            </div>
            <p className="text-xs text-muted-foreground mt-1">Current month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData.profitMargin.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Average margin</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Hot Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData.hotLeadsCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Active hot leads</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Jobs at Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {dashboardData.jobsAtRisk}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Need attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Avg Days to Complete</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData.avgDaysToComplete}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Average job duration</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Crew Efficiency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData.crewEfficiency.avgHours.toFixed(1)} hrs
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg install time ({dashboardData.crewEfficiency.jobsTracked} jobs)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Material Waste</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData.materialWasteTrends.highWasteJobs}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              High waste jobs ({dashboardData.materialWasteTrends.totalJobsTracked} tracked)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sales Rep Rankings */}
      {dashboardData.topSalesReps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Sales Reps</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesRepsData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="revenue" fill="#0088FE" name="Revenue ($)" />
                <Bar dataKey="winRate" fill="#00C49F" name="Win Rate (%)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/dashboard/analytics/roofing/leads">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="text-sm">Lead Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Source performance, quality scores, conversion funnels
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/analytics/roofing/jobs">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="text-sm">Job Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Stage durations, profitability, delays
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/analytics/roofing/team">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="text-sm">Team Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Sales, insurance, ops, crews
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/analytics/roofing/marketing">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="text-sm">Outreach ROI</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Outreach performance, cost per lead/job
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}




































