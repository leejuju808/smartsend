"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { Loader2, AlertCircle } from "lucide-react";

interface DealAnalytics {
  totals: {
    open_value: number;
    forecast_value: number;
    won_value: number;
    lost_value: number;
    open_deals: number;
    won_deals: number;
    lost_deals: number;
  };
  by_stage: Array<{
    stage: string;
    count: number;
    value: number;
    avg_age_days: number;
  }>;
  stage_conversion: Record<string, number>;
  velocity: Record<string, number>;
  owner_splits: Array<{
    owner_id: string;
    name: string;
    open_deals: number;
    open_value: number;
    won_deals: number;
    won_value: number;
    avg_velocity_days: number;
  }>;
  deal_sources: Array<{
    campaign_id: string;
    name: string;
    created: number;
    won: number;
    value: number;
  }>;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  working: "Working",
  meeting: "Meeting",
  proposal: "Proposal",
  negotiation: "Negotiation",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

export default function PipelineAnalyticsPage() {
  const [analytics, setAnalytics] = useState<DealAnalytics | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pipeline/analytics");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.analytics) {
        setAnalytics(data.analytics);
        setGeneratedAt(data.generated_at);
      } else {
        setError("No analytics data available yet. Analytics are generated hourly.");
      }
    } catch (e) {
      setError("Failed to load analytics");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p>{error || "No analytics data available"}</p>
            </div>
            <button
              onClick={loadAnalytics}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const conversionRate =
    analytics.totals.won_deals + analytics.totals.lost_deals > 0
      ? analytics.totals.won_deals / (analytics.totals.won_deals + analytics.totals.lost_deals)
      : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deal Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {generatedAt
              ? `Last updated: ${new Date(generatedAt).toLocaleString()}`
              : "Analytics are generated hourly"}
          </p>
        </div>
        <button
          onClick={loadAnalytics}
          className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
        >
          Refresh
        </button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="conversion">Stage Conversion</TabsTrigger>
          <TabsTrigger value="velocity">Velocity</TabsTrigger>
          <TabsTrigger value="owners">Owners</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Open Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(analytics.totals.open_value)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Forecast Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(analytics.totals.forecast_value)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Won Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(analytics.totals.won_value)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Lost Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(analytics.totals.lost_value)}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Open Deals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.totals.open_deals}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Won Deals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {analytics.totals.won_deals}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Conversion Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPercent(conversionRate)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Pipeline Value by Stage */}
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Value by Stage</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.by_stage}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="stage"
                    tickFormatter={(value) => STAGE_LABELS[value] || value}
                  />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stage Conversion Tab */}
        <TabsContent value="conversion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Stage Conversion Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(analytics.stage_conversion).map(([transition, rate]) => {
                  const [from, to] = transition.split(" → ");
                  return (
                    <div key={transition} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {STAGE_LABELS[from] || from} → {STAGE_LABELS[to] || to}
                        </span>
                        <span className="text-sm font-bold">{formatPercent(rate)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full"
                          style={{ width: `${rate * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Velocity Tab */}
        <TabsContent value="velocity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Average Days in Stage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(analytics.velocity)
                  .sort(([, a], [, b]) => b - a)
                  .map(([stage, days]) => (
                    <div key={stage} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {STAGE_LABELS[stage] || stage}
                        </span>
                        <span className="text-sm font-bold">{days.toFixed(1)} days</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{
                            width: `${
                              (days /
                                Math.max(...Object.values(analytics.velocity), 1)) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Owners Tab */}
        <TabsContent value="owners" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Owner Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Owner</th>
                      <th className="text-right p-2">Open Deals</th>
                      <th className="text-right p-2">Open Value</th>
                      <th className="text-right p-2">Won Deals</th>
                      <th className="text-right p-2">Won Value</th>
                      <th className="text-right p-2">Velocity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.owner_splits.map((owner) => (
                      <tr key={owner.owner_id} className="border-b">
                        <td className="p-2 font-medium">{owner.name}</td>
                        <td className="p-2 text-right">{owner.open_deals}</td>
                        <td className="p-2 text-right">{formatCurrency(owner.open_value)}</td>
                        <td className="p-2 text-right">{owner.won_deals}</td>
                        <td className="p-2 text-right">{formatCurrency(owner.won_value)}</td>
                        <td className="p-2 text-right">
                          {owner.avg_velocity_days.toFixed(1)} days
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Pie Chart: Pipeline % per Owner */}
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Distribution by Owner</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={analytics.owner_splits.map((o) => ({
                      name: o.name,
                      value: o.open_value,
                    }))}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {analytics.owner_splits.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sources Tab */}
        <TabsContent value="sources" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Deal Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Campaign</th>
                      <th className="text-right p-2">Created</th>
                      <th className="text-right p-2">Won</th>
                      <th className="text-right p-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.deal_sources.map((source) => (
                      <tr key={source.campaign_id} className="border-b">
                        <td className="p-2 font-medium">{source.name}</td>
                        <td className="p-2 text-right">{source.created}</td>
                        <td className="p-2 text-right">{source.won}</td>
                        <td className="p-2 text-right">{formatCurrency(source.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Stacked Bar Chart by Stage */}
          <Card>
            <CardHeader>
              <CardTitle>Deal Creation by Campaign</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.deal_sources}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="created" stackId="a" fill="#3b82f6" name="Created" />
                  <Bar dataKey="won" stackId="a" fill="#10b981" name="Won" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aging Tab */}
        <TabsContent value="aging" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Deal Aging by Stage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.by_stage
                  .filter((s) => !s.stage.startsWith("closed_"))
                  .sort((a, b) => b.avg_age_days - a.avg_age_days)
                  .map((stage) => (
                    <div key={stage.stage} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {STAGE_LABELS[stage.stage] || stage.stage}
                        </span>
                        <div className="flex items-center gap-4">
                          <span className="text-sm">{stage.count} deals</span>
                          <span
                            className={`text-sm font-bold ${
                              stage.avg_age_days > 14 ? "text-red-600" : "text-gray-900"
                            }`}
                          >
                            {stage.avg_age_days.toFixed(1)} days avg
                          </span>
                        </div>
                      </div>
                      {stage.avg_age_days > 14 && (
                        <div className="text-xs text-red-600">
                          ⚠️ Deals in this stage are aging (over 14 days)
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}








