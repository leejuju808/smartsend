"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClientComponentClient } from "@/lib/supabase";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import Link from "next/link";

type TeamPerformanceData = {
  salesTeam: Array<{
    rep_email: string;
    total_leads: number;
    inspections_scheduled: number;
    quotes_sent: number;
    jobs_won: number;
    close_rate_pct: number;
    avg_job_size: number;
    total_revenue: number;
    avg_response_time_minutes: number;
    inspections_per_week: number;
  }>;
  crews: Array<{
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
  insuranceTeam: {
    totalJobs: number;
    approvedJobs: number;
    approvalRate: number;
    avgApprovalTimeDays: number;
  };
  opsTeam: {
    scheduledJobs: number;
    inProgressJobs: number;
    completedJobs: number;
    schedulingEfficiency: number;
  };
};

export default function TeamPerformancePage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [data, setData] = useState<TeamPerformanceData | null>(null);
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
        const res = await fetch(`/api/analytics/team?workspaceId=${workspaceId}`);
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error loading team performance:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading team performance...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">No team performance data available.</div>
      </div>
    );
  }

  const salesRepsData = data.salesTeam.map((rep) => ({
    name: rep.rep_email.split('@')[0],
    closeRate: rep.close_rate_pct,
    revenue: rep.total_revenue,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Team Performance</h1>
        <Link href="/dashboard/analytics/roofing">
          <button className="px-4 py-2 text-sm bg-muted rounded-md">
            Back to Dashboard
          </button>
        </Link>
      </div>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList>
          <TabsTrigger value="sales">Sales Team</TabsTrigger>
          <TabsTrigger value="insurance">Insurance Team</TabsTrigger>
          <TabsTrigger value="ops">Ops Team</TabsTrigger>
          <TabsTrigger value="crews">Crews</TabsTrigger>
        </TabsList>

        {/* Sales Team */}
        <TabsContent value="sales">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Sales Team Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {data.salesTeam.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={salesRepsData}>
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="closeRate" fill="#0088FE" name="Close Rate %" />
                      <Bar dataKey="revenue" fill="#00C49F" name="Revenue ($)" />
                    </BarChart>
                  </ResponsiveContainer>
                  <Table className="mt-4">
                    <THead>
                      <TR>
                        <TH>Rep</TH>
                        <TH className="text-right">Total Leads</TH>
                        <TH className="text-right">Inspections</TH>
                        <TH className="text-right">Quotes</TH>
                        <TH className="text-right">Jobs Won</TH>
                        <TH className="text-right">Close Rate</TH>
                        <TH className="text-right">Avg Job Size</TH>
                        <TH className="text-right">Total Revenue</TH>
                        <TH className="text-right">Inspections/Week</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.salesTeam.map((rep) => (
                        <TR key={rep.rep_email}>
                          <TD className="font-medium">{rep.rep_email.split('@')[0]}</TD>
                          <TD className="text-right">{rep.total_leads}</TD>
                          <TD className="text-right">{rep.inspections_scheduled}</TD>
                          <TD className="text-right">{rep.quotes_sent}</TD>
                          <TD className="text-right">{rep.jobs_won}</TD>
                          <TD className="text-right">{rep.close_rate_pct.toFixed(1)}%</TD>
                          <TD className="text-right">
                            ${(rep.avg_job_size / 1000).toFixed(1)}K
                          </TD>
                          <TD className="text-right">
                            ${(rep.total_revenue / 1000).toFixed(1)}K
                          </TD>
                          <TD className="text-right">
                            {rep.inspections_per_week.toFixed(1)}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No sales team data available.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insurance Team */}
        <TabsContent value="insurance">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Insurance Team Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{data.insuranceTeam.totalJobs}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Approved Jobs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{data.insuranceTeam.approvedJobs}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {data.insuranceTeam.approvalRate.toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Avg Approval Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {data.insuranceTeam?.avgApprovalTimeDays?.toFixed(1) || "N/A"} days
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ops Team */}
        <TabsContent value="ops">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Ops Team Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Scheduled Jobs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{data.opsTeam.scheduledJobs}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{data.opsTeam.inProgressJobs}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Completed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{data.opsTeam.completedJobs}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Scheduling Efficiency</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {data.opsTeam.schedulingEfficiency.toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Crews */}
        <TabsContent value="crews">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Crew Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {data.crews.length > 0 ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>Crew</TH>
                      <TH className="text-right">Jobs Completed</TH>
                      <TH className="text-right">Jobs In Progress</TH>
                      <TH className="text-right">Avg Install Days</TH>
                      <TH className="text-right">Avg Quality Score</TH>
                      <TH className="text-right">Avg Margin %</TH>
                      <TH className="text-right">Total Profit</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.crews.map((crew) => (
                      <TR key={crew.crew_name}>
                        <TD className="font-medium">{crew.crew_name}</TD>
                        <TD className="text-right">{crew.jobs_completed}</TD>
                        <TD className="text-right">{crew.jobs_in_progress}</TD>
                        <TD className="text-right">
                          {crew.avg_install_days ? crew.avg_install_days.toFixed(1) : "N/A"}
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
              ) : (
                <p className="text-sm text-muted-foreground">No crew data available.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}




































