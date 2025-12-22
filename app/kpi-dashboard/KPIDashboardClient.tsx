"use client";

// Block 85000 — SmartSend Roofing "Owner KPI Dashboard + Business Health Score Engine" v1
// Client Component: KPI Dashboard

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2 } from "lucide-react";

interface KPISnapshot {
  id: string;
  date: string;
  total_leads: number;
  hot_leads: number;
  warm_leads: number;
  booked_estimates: number;
  estimates_sent: number;
  jobs_won: number;
  jobs_lost: number;
  revenue_won: number;
  pipeline_value: number;
  average_job_value: number;
  close_rate: number;
  email_open_rate: number;
  email_reply_rate: number;
  crew_on_time_rate: number;
  homeowner_satisfaction: number;
  top_zip_codes: Array<{ zip: string; revenue: number; jobs: number }>;
}

interface HealthScore {
  score: number;
  grade: string;
  problems: string[];
  strengths: string[];
  recommendations: Array<{
    priority: string;
    action: string;
    impact: string;
  }>;
}

interface CrewPerformance {
  crew_id: string;
  crew_name: string;
  jobs_completed: number;
  avg_rating: number;
  on_time_percentage: number;
}

interface DashboardData {
  latest_snapshot: KPISnapshot | null;
  trends: KPISnapshot[];
  health_score: HealthScore | null;
  crew_performance: CrewPerformance[];
  zip_code_revenue: Array<{ zip: string; revenue: number; jobs: number }>;
  campaign_metrics: Array<{
    id: string;
    name: string;
    sent: number;
    opened: number;
    replied: number;
    open_rate: number;
    reply_rate: number;
  }>;
}

export default function KPIDashboardClient({
  companyId,
  workspaceId,
  orgId,
}: {
  companyId?: string;
  workspaceId?: string;
  orgId?: string;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const params = new URLSearchParams();
        if (companyId) params.append("company_id", companyId);
        if (workspaceId) params.append("workspace_id", workspaceId);
        if (orgId) params.append("org_id", orgId);
        params.append("days", "30");

        const response = await fetch(`/api/kpi/dashboard?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch dashboard data");
        const result = await response.json();
        setData(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [companyId, workspaceId, orgId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">Error: {error || "Failed to load data"}</div>
      </div>
    );
  }

  const snapshot = data.latest_snapshot;
  const health = data.health_score;

  // Prepare trend data for charts
  const leadsTrend = data.trends.map((t) => ({
    date: new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    leads: t.total_leads,
    hot: t.hot_leads,
    warm: t.warm_leads,
  }));

  const revenueTrend = data.trends.map((t) => ({
    date: new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    revenue: t.revenue_won,
    pipeline: t.pipeline_value,
  }));

  const emailTrend = data.trends.map((t) => ({
    date: new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    open_rate: t.email_open_rate,
    reply_rate: t.email_reply_rate,
  }));

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  return (
    <div className="space-y-6">
      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Won (30d)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${((snapshot?.revenue_won || 0) / 1000).toFixed(1)}k
            </div>
            <p className="text-xs text-muted-foreground">
              Avg job: ${((snapshot?.average_job_value || 0) / 1000).toFixed(1)}k
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${((snapshot?.pipeline_value || 0) / 1000).toFixed(1)}k
            </div>
            <p className="text-xs text-muted-foreground">
              Close rate: {snapshot?.close_rate?.toFixed(1) || 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hot Leads</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{snapshot?.hot_leads || 0}</div>
            <p className="text-xs text-muted-foreground">
              Total: {snapshot?.total_leads || 0} leads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Booked Estimates</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{snapshot?.booked_estimates || 0}</div>
            <p className="text-xs text-muted-foreground">
              Sent: {snapshot?.estimates_sent || 0} estimates
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Business Health Score */}
      {health && (
        <Card>
          <CardHeader>
            <CardTitle>Business Health Score</CardTitle>
            <CardDescription>AI-generated company health assessment</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-6xl font-bold">{health.score.toFixed(0)}</div>
              <div>
                <Badge variant={health.grade.startsWith("A") ? "default" : health.grade.startsWith("B") ? "secondary" : "destructive"}>
                  Grade {health.grade}
                </Badge>
                <div className="mt-2 space-y-1">
                  {health.strengths.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-green-600">Strengths:</div>
                      <ul className="text-xs text-muted-foreground list-disc list-inside">
                        {health.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {health.problems.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-red-600">Issues:</div>
                      <ul className="text-xs text-muted-foreground list-disc list-inside">
                        {health.problems.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {health.recommendations.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Recommendations:</div>
                <ul className="space-y-1">
                  {health.recommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      <Badge variant={rec.priority === "high" ? "destructive" : "secondary"} className="mr-2">
                        {rec.priority}
                      </Badge>
                      {rec.action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trend Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Leads Trend (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={leadsTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="leads" stroke="#3b82f6" name="Total Leads" />
                <Line type="monotone" dataKey="hot" stroke="#ef4444" name="Hot Leads" />
                <Line type="monotone" dataKey="warm" stroke="#f59e0b" name="Warm Leads" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value: number) => `$${(value / 1000).toFixed(1)}k`} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#10b981" name="Revenue Won" />
                <Line type="monotone" dataKey="pipeline" stroke="#8b5cf6" name="Pipeline Value" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Email Performance (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={emailTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="open_rate" stroke="#3b82f6" name="Open Rate %" />
                <Line type="monotone" dataKey="reply_rate" stroke="#10b981" name="Reply Rate %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Close Rate Trend (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.trends.map((t) => ({
                date: new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                close_rate: t.close_rate,
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="close_rate" stroke="#10b981" name="Close Rate %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ZIP Code Revenue Heatmap */}
      {data.zip_code_revenue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top ZIP Codes by Revenue</CardTitle>
            <CardDescription>Your highest-performing neighborhoods</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.zip_code_revenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="zip" />
                <YAxis />
                <Tooltip formatter={(value: number) => `$${(value / 1000).toFixed(1)}k`} />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="#3b82f6">
                  {data.zip_code_revenue.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Crew Performance */}
      {data.crew_performance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Crew Performance</CardTitle>
            <CardDescription>Performance metrics by crew</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Crew</th>
                    <th className="text-right p-2">Jobs Completed</th>
                    <th className="text-right p-2">On-Time %</th>
                    <th className="text-right p-2">Avg Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {data.crew_performance.map((crew) => (
                    <tr key={crew.crew_id} className="border-b">
                      <td className="p-2">{crew.crew_name || `Crew ${crew.crew_id.slice(0, 8)}`}</td>
                      <td className="text-right p-2">{crew.jobs_completed}</td>
                      <td className="text-right p-2">{crew.on_time_percentage.toFixed(1)}%</td>
                      <td className="text-right p-2">{crew.avg_rating.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Marketing ROI */}
      {data.campaign_metrics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Marketing ROI Dashboard</CardTitle>
            <CardDescription>Campaign performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Campaign</th>
                    <th className="text-right p-2">Sent</th>
                    <th className="text-right p-2">Opened</th>
                    <th className="text-right p-2">Replied</th>
                    <th className="text-right p-2">Open Rate</th>
                    <th className="text-right p-2">Reply Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaign_metrics.map((campaign) => (
                    <tr key={campaign.id} className="border-b">
                      <td className="p-2">{campaign.name}</td>
                      <td className="text-right p-2">{campaign.sent}</td>
                      <td className="text-right p-2">{campaign.opened}</td>
                      <td className="text-right p-2">{campaign.replied}</td>
                      <td className="text-right p-2">{campaign.open_rate.toFixed(1)}%</td>
                      <td className="text-right p-2">{campaign.reply_rate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Additional KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Homeowner Satisfaction</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {snapshot?.homeowner_satisfaction?.toFixed(1) || "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Out of 5.0</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Crew On-Time Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {snapshot?.crew_on_time_rate?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Email Reply Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {snapshot?.email_reply_rate?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Open rate: {snapshot?.email_open_rate?.toFixed(1) || 0}%
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



























