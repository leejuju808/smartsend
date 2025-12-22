"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { createClientComponentClient } from "@/lib/supabase";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import Link from "next/link";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

type LeadAnalyticsData = {
  leadsBySource: Array<{
    source: string;
    total_leads: number;
    inspections_scheduled: number;
    quotes_sent: number;
    jobs_won: number;
    lead_to_inspection_rate: number;
    inspection_to_quote_rate: number;
    quote_to_job_rate: number;
    avg_response_time_minutes: number;
    avg_quality_score: number;
    total_job_value: number;
  }>;
  salesRepPerformance: Array<{
    rep_email: string;
    total_leads: number;
    inspections_scheduled: number;
    quotes_sent: number;
    jobs_won: number;
    win_rate_pct: number;
    avg_job_value: number;
    total_job_value: number;
    avg_response_time_minutes: number;
    avg_quality_score: number;
  }>;
  qualityDistribution: {
    hot: number;
    warm: number;
    cold: number;
  };
  funnelMetrics: {
    totalLeads: number;
    inspections: number;
    quotes: number;
    jobs: number;
    leadToInspectionRate: number;
    inspectionToQuoteRate: number;
    quoteToJobRate: number;
  };
};

export default function LeadAnalyticsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [data, setData] = useState<LeadAnalyticsData | null>(null);
  const [dateRange, setDateRange] = useState("30d");
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

    const loadData = async () => {
      try {
        const res = await fetch(
          `/api/analytics/leads?workspaceId=${workspaceId}&dateRange=${dateRange}`
        );
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error loading lead analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [workspaceId, dateRange]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading lead analytics...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">No lead analytics data available.</div>
      </div>
    );
  }

  const qualityData = [
    { name: "Hot", value: data.qualityDistribution.hot },
    { name: "Warm", value: data.qualityDistribution.warm },
    { name: "Cold", value: data.qualityDistribution.cold },
  ];

  const funnelData = [
    { name: "Leads", value: data.funnelMetrics.totalLeads },
    { name: "Inspections", value: data.funnelMetrics.inspections },
    { name: "Quotes", value: data.funnelMetrics.quotes },
    { name: "Jobs Won", value: data.funnelMetrics.jobs },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lead Analytics</h1>
        <div className="flex items-center gap-4">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </Select>
          <Link href="/dashboard/analytics/roofing">
            <button className="px-4 py-2 text-sm bg-muted rounded-md">
              Back to Dashboard
            </button>
          </Link>
        </div>
      </div>

      {/* Funnel Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.funnelMetrics.totalLeads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Lead → Inspection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.funnelMetrics.leadToInspectionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">{data.funnelMetrics.inspections} inspections</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Inspection → Quote</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.funnelMetrics.inspectionToQuoteRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">{data.funnelMetrics.quotes} quotes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Quote → Job</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.funnelMetrics.quoteToJobRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">{data.funnelMetrics.jobs} jobs won</p>
          </CardContent>
        </Card>
      </div>

      {/* Quality Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Lead Quality Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={qualityData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {qualityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Leads by Source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Leads by Source</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Source</TH>
                <TH className="text-right">Total Leads</TH>
                <TH className="text-right">Inspections</TH>
                <TH className="text-right">Quotes</TH>
                <TH className="text-right">Jobs Won</TH>
                <TH className="text-right">Lead → Insp %</TH>
                <TH className="text-right">Insp → Quote %</TH>
                <TH className="text-right">Quote → Job %</TH>
                <TH className="text-right">Total Value</TH>
              </TR>
            </THead>
            <TBody>
              {data.leadsBySource.map((source) => (
                <TR key={source.source}>
                  <TD className="font-medium">{source.source}</TD>
                  <TD className="text-right">{source.total_leads}</TD>
                  <TD className="text-right">{source.inspections_scheduled}</TD>
                  <TD className="text-right">{source.quotes_sent}</TD>
                  <TD className="text-right">{source.jobs_won}</TD>
                  <TD className="text-right">{source.lead_to_inspection_rate.toFixed(1)}%</TD>
                  <TD className="text-right">{source.inspection_to_quote_rate.toFixed(1)}%</TD>
                  <TD className="text-right">{source.quote_to_job_rate.toFixed(1)}%</TD>
                  <TD className="text-right">
                    ${(source.total_job_value / 1000).toFixed(1)}K
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sales Rep Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Sales Rep Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Rep</TH>
                <TH className="text-right">Total Leads</TH>
                <TH className="text-right">Inspections</TH>
                <TH className="text-right">Quotes</TH>
                <TH className="text-right">Jobs Won</TH>
                <TH className="text-right">Win Rate</TH>
                <TH className="text-right">Avg Job Value</TH>
                <TH className="text-right">Total Revenue</TH>
                <TH className="text-right">Avg Response Time</TH>
              </TR>
            </THead>
            <TBody>
              {data.salesRepPerformance.map((rep) => (
                <TR key={rep.rep_email}>
                  <TD className="font-medium">{rep.rep_email.split('@')[0]}</TD>
                  <TD className="text-right">{rep.total_leads}</TD>
                  <TD className="text-right">{rep.inspections_scheduled}</TD>
                  <TD className="text-right">{rep.quotes_sent}</TD>
                  <TD className="text-right">{rep.jobs_won}</TD>
                  <TD className="text-right">{rep.win_rate_pct.toFixed(1)}%</TD>
                  <TD className="text-right">
                    ${(rep.avg_job_value / 1000).toFixed(1)}K
                  </TD>
                  <TD className="text-right">
                    ${(rep.total_job_value / 1000).toFixed(1)}K
                  </TD>
                  <TD className="text-right">
                    {rep.avg_response_time_minutes
                      ? `${Math.round(rep.avg_response_time_minutes / 60)}h`
                      : "N/A"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}




































