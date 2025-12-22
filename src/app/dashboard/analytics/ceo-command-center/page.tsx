"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClientComponentClient } from "@/lib/supabase";
import Link from "next/link";
import { AlertCircle, TrendingUp, DollarSign, Users, Calendar, FileText, BarChart3 } from "lucide-react";
import CEOAlerts from "@/components/analytics/CEOAlerts";

type DashboardSummary = {
  smartsend?: {
    state: "running" | "paused";
    paused_at: string | null;
    paused_reason: string | null;
  };
  revenue: {
    total: number;
    sold: number;
    completed: number;
    currentMonth: number;
  };
  pipeline: {
    jobsCount: number;
    value: number;
  };
  sales: {
    closeRate: number;
    leadsNew: number;
    estimatesSent: number;
    contractsSigned: number;
  };
  financial: {
    avgJobSize: number;
    arTotal: number;
    overdueInvoices: number;
  };
  forecast: {
    next30Days: number;
    next60Days: number;
    next90Days: number;
  };
};

type DisabledPayload = {
  disabled: true;
  message: string;
  smartsend?: {
    state: "running" | "paused";
    paused_at: string | null;
    paused_reason: string | null;
  };
};

export default function CEOCommandCenterPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [systemOffMessage, setSystemOffMessage] = useState<string | null>(null);
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
        const res = await fetch(`/api/analytics/ceo-dashboard/summary?wid=${workspaceId}`);
        if (!res.ok) throw new Error("Failed to fetch dashboard");
        const data = (await res.json().catch(() => null)) as DashboardSummary | DisabledPayload | null;
        if (data && (data as any).disabled) {
          setSummary(null);
          setSystemOffMessage(String((data as any).message || "No system running."));
          return;
        }
        setSystemOffMessage(null);
        setSummary(data as DashboardSummary);
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
        <div className="text-sm">Loading CEO Command Center...</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">
          {systemOffMessage || "No data available."}
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">CEO Command Center</h1>
          <p className="text-muted-foreground mt-1">
            Your complete business intelligence dashboard
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/analytics/ceo-command-center/jobs">
            <button className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md">
              Job Profitability
            </button>
          </Link>
          <Link href="/dashboard/analytics/ceo-command-center/sales">
            <button className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md">
              Sales Dashboard
            </button>
          </Link>
          <Link href="/dashboard/analytics/ceo-command-center/crews">
            <button className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md">
              Crew Performance
            </button>
          </Link>
        </div>
      </div>

      {/* Alerts */}
      <CEOAlerts workspaceId={workspaceId} />

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue This Month */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue This Month</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.revenue.currentMonth)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(summary.revenue.completed)} completed
            </p>
          </CardContent>
        </Card>

        {/* Sales Close Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales Close Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.sales.closeRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.sales.contractsSigned} signed / {summary.sales.leadsNew} leads
            </p>
          </CardContent>
        </Card>

        {/* Jobs in Production */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs in Production</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.pipeline.jobsCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(summary.pipeline.value)} in pipeline
            </p>
          </CardContent>
        </Card>

        {/* A/R - Money Waiting */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accounts Receivable</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.financial.arTotal)}
            </div>
            {summary.financial.overdueInvoices > 0 && (
              <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {summary.financial.overdueInvoices} overdue
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Average Job Size */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Average Job Size</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.financial.avgJobSize)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Per completed job</p>
          </CardContent>
        </Card>

        {/* Forecast Next 30 Days */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">30-Day Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.forecast.next30Days)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Projected revenue</p>
          </CardContent>
        </Card>

        {/* Total Revenue */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.revenue.total)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(summary.revenue.sold)} sold
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Forecast Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Revenue Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Next 30 Days</p>
              <p className="text-xl font-bold mt-1">
                {formatCurrency(summary.forecast.next30Days)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Next 60 Days</p>
              <p className="text-xl font-bold mt-1">
                {formatCurrency(summary.forecast.next60Days)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Next 90 Days</p>
              <p className="text-xl font-bold mt-1">
                {formatCurrency(summary.forecast.next90Days)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/dashboard/analytics/ceo-command-center/jobs">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="text-sm">Job Profitability</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                See which jobs are profitable and where you're losing margin
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/analytics/ceo-command-center/sales">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="text-sm">Sales Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Funnel conversion, revenue per rep, win rates
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/analytics/ceo-command-center/crews">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="text-sm">Crew Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Safety scores, completion times, productivity
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/analytics/ceo-command-center/ar">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="text-sm">Accounts Receivable</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Unpaid invoices, overdue tracking, reminders
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
























