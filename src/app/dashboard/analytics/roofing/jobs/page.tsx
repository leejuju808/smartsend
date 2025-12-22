"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { createClientComponentClient } from "@/lib/supabase";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import Link from "next/link";

type JobAnalyticsData = {
  stageDurations: Array<{
    stage: string;
    job_count: number;
    avg_duration_hours: number;
    avg_duration_days: number;
    min_duration_hours: number;
    max_duration_hours: number;
  }>;
  profitability: {
    insuranceJobs: number;
    retailJobs: number;
    avgInsuranceMargin: number;
    avgRetailMargin: number;
    avgJobValue: number;
    totalProfit: number;
  };
  delays: Array<{
    delay_type: string;
    delay_count: number;
    avg_delay_hours: number;
    total_delay_hours: number;
    jobs_affected: number;
  }>;
  crewPerformance: Array<{
    crew_name: string;
    jobs_completed: number;
    jobs_in_progress: number;
    avg_install_hours: number;
    avg_install_days: number;
    avg_quality_score: number;
    avg_callback_rate: number;
    avg_margin_pct: number;
    total_profit: number;
  }>;
  avgInstallDuration: number;
};

export default function JobAnalyticsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [data, setData] = useState<JobAnalyticsData | null>(null);
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
          `/api/analytics/jobs?workspaceId=${workspaceId}&dateRange=${dateRange}`
        );
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error loading job analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [workspaceId, dateRange]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading job analytics...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">No job analytics data available.</div>
      </div>
    );
  }

  const stageDurationData = data.stageDurations.map((stage) => ({
    name: stage.stage.replace(/_/g, ' '),
    days: stage.avg_duration_days || 0,
  }));

  const profitabilityData = [
    {
      name: "Insurance",
      margin: data.profitability.avgInsuranceMargin,
      jobs: data.profitability.insuranceJobs,
    },
    {
      name: "Retail",
      margin: data.profitability.avgRetailMargin,
      jobs: data.profitability.retailJobs,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Job Analytics</h1>
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

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Avg Install Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.avgInstallDuration ? (data.avgInstallDuration / 24).toFixed(1) : "N/A"} days
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Insurance Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.profitability.avgInsuranceMargin.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">{data.profitability.insuranceJobs} jobs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Retail Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.profitability.avgRetailMargin.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">{data.profitability.retailJobs} jobs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(data.profitability.totalProfit / 1000).toFixed(1)}K
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stage Durations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Average Time in Pipeline Stages</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stageDurationData}>
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="days" fill="#0088FE" name="Days" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Stage Durations Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Stage Duration Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Stage</TH>
                <TH className="text-right">Job Count</TH>
                <TH className="text-right">Avg Duration (Days)</TH>
                <TH className="text-right">Min Duration (Days)</TH>
                <TH className="text-right">Max Duration (Days)</TH>
              </TR>
            </THead>
            <TBody>
              {data.stageDurations.map((stage) => (
                <TR key={stage.stage}>
                  <TD className="font-medium">{stage.stage.replace(/_/g, ' ')}</TD>
                  <TD className="text-right">{stage.job_count}</TD>
                  <TD className="text-right">
                    {stage.avg_duration_days ? stage.avg_duration_days.toFixed(1) : "N/A"}
                  </TD>
                  <TD className="text-right">
                    {stage.min_duration_hours ? (stage.min_duration_hours / 24).toFixed(1) : "N/A"}
                  </TD>
                  <TD className="text-right">
                    {stage.max_duration_hours ? (stage.max_duration_hours / 24).toFixed(1) : "N/A"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* Profitability */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Profitability by Job Type</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={profitabilityData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="margin" fill="#00C49F" name="Margin %" />
              <Bar dataKey="jobs" fill="#FFBB28" name="Job Count" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Job Delays */}
      {data.delays.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Job Delays Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Delay Type</TH>
                  <TH className="text-right">Delay Count</TH>
                  <TH className="text-right">Avg Delay (Hours)</TH>
                  <TH className="text-right">Total Delay (Hours)</TH>
                  <TH className="text-right">Jobs Affected</TH>
                </TR>
              </THead>
              <TBody>
                {data.delays.map((delay) => (
                  <TR key={delay.delay_type}>
                    <TD className="font-medium">{delay.delay_type.replace(/_/g, ' ')}</TD>
                    <TD className="text-right">{delay.delay_count}</TD>
                    <TD className="text-right">{delay.avg_delay_hours.toFixed(1)}</TD>
                    <TD className="text-right">{delay.total_delay_hours.toFixed(1)}</TD>
                    <TD className="text-right">{delay.jobs_affected}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Crew Performance */}
      {data.crewPerformance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Crew Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Crew</TH>
                  <TH className="text-right">Jobs Completed</TH>
                  <TH className="text-right">Avg Install Hours</TH>
                  <TH className="text-right">Avg Quality Score</TH>
                  <TH className="text-right">Avg Margin %</TH>
                  <TH className="text-right">Total Profit</TH>
                </TR>
              </THead>
              <TBody>
                {data.crewPerformance.map((crew) => (
                  <TR key={crew.crew_name}>
                    <TD className="font-medium">{crew.crew_name}</TD>
                    <TD className="text-right">{crew.jobs_completed}</TD>
                    <TD className="text-right">
                      {crew.avg_install_hours ? crew.avg_install_hours.toFixed(1) : "N/A"}
                    </TD>
                    <TD className="text-right">
                      {crew.avg_quality_score ? crew.avg_quality_score.toFixed(1) : "N/A"}
                    </TD>
                    <TD className="text-right">
                      {crew.avg_margin_pct ? crew.avg_margin_pct.toFixed(1) : "N/A"}%
                    </TD>
                    <TD className="text-right">
                      ${(crew.total_profit / 1000).toFixed(1)}K
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}




































