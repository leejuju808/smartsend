"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { createClientComponentClient } from "@/lib/supabase";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

type SalesFunnelData = {
  funnel: {
    leadsNew: number;
    estimatesSent: number;
    contractsSigned: number;
    lostLeads: number;
    totalLeads: number;
  };
  conversionRates: {
    leadToEstimate: number;
    estimateToClose: number;
    overallClose: number;
    closeRatePct: number;
  };
  performance: {
    avgQuoteResponseTimeDays: number;
  };
  topSalesReps: Array<{
    repEmail: string;
    repName: string;
    dealsClosed: number;
    totalLeads: number;
    winRate: number;
    totalRevenue: number;
    avgDealSize: number;
  }>;
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function SalesDashboardPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [funnelData, setFunnelData] = useState<SalesFunnelData | null>(null);
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

    const loadFunnel = async () => {
      try {
        const res = await fetch(`/api/analytics/ceo-dashboard/sales-funnel?wid=${workspaceId}`);
        if (!res.ok) throw new Error("Failed to fetch sales funnel");
        const data = await res.json();
        setFunnelData(data);
      } catch (error) {
        console.error("Error loading sales funnel:", error);
      } finally {
        setLoading(false);
      }
    };

    loadFunnel();
  }, [workspaceId]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading sales dashboard...</div>
      </div>
    );
  }

  if (!funnelData) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">No data available.</div>
      </div>
    );
  }

  // Funnel chart data
  const funnelChartData = [
    { name: 'New Leads', value: funnelData.funnel.leadsNew },
    { name: 'Estimates Sent', value: funnelData.funnel.estimatesSent },
    { name: 'Contracts Signed', value: funnelData.funnel.contractsSigned },
    { name: 'Lost', value: funnelData.funnel.lostLeads },
  ];

  // Sales reps chart data
  const salesRepsChartData = funnelData.topSalesReps.map(rep => ({
    name: rep.repName || rep.repEmail.split('@')[0],
    revenue: rep.totalRevenue,
    winRate: rep.winRate,
    dealsClosed: rep.dealsClosed,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/analytics/ceo-command-center">
            <ArrowLeft className="h-5 w-5 cursor-pointer" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Sales Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Funnel conversion, revenue per rep, win rates
            </p>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Overall Close Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {funnelData.conversionRates.overallClose.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {funnelData.funnel.contractsSigned} signed / {funnelData.funnel.leadsNew} leads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Lead → Estimate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {funnelData.conversionRates.leadToEstimate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {funnelData.funnel.estimatesSent} estimates sent
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Estimate → Close</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {funnelData.conversionRates.estimateToClose.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {funnelData.funnel.contractsSigned} closed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Avg Quote Response</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {funnelData.performance.avgQuoteResponseTimeDays.toFixed(1)} days
            </div>
            <p className="text-xs text-muted-foreground mt-1">Time to respond</p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelChartData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#0088FE" name="Count" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Sales Reps */}
      {funnelData.topSalesReps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Sales Reps</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesRepsChartData}>
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" fill="#0088FE" name="Revenue ($)" />
                <Bar yAxisId="right" dataKey="winRate" fill="#00C49F" name="Win Rate (%)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Sales Reps Table */}
      {funnelData.topSalesReps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sales Rep Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Rep</th>
                    <th className="text-right p-2">Deals Closed</th>
                    <th className="text-right p-2">Total Leads</th>
                    <th className="text-right p-2">Win Rate</th>
                    <th className="text-right p-2">Total Revenue</th>
                    <th className="text-right p-2">Avg Deal Size</th>
                  </tr>
                </thead>
                <tbody>
                  {funnelData.topSalesReps.map((rep, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium">
                        {rep.repName || rep.repEmail}
                      </td>
                      <td className="text-right p-2">{rep.dealsClosed}</td>
                      <td className="text-right p-2">{rep.totalLeads}</td>
                      <td className="text-right p-2">{rep.winRate.toFixed(1)}%</td>
                      <td className="text-right p-2 font-medium">
                        {formatCurrency(rep.totalRevenue)}
                      </td>
                      <td className="text-right p-2">
                        {formatCurrency(rep.avgDealSize)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

























