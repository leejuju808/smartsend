"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, TrendingUp, AlertTriangle, BarChart3 } from "lucide-react";

interface PipelineTotals {
  totals: Array<{
    pipeline_stage: string;
    thread_count: number;
    total_revenue: number;
    avg_revenue: number;
    avg_probability: number;
  }>;
  total_pipeline: number;
}

interface Forecast {
  forecasted_revenue: number;
  best_case_revenue: number;
  worst_case_revenue: number;
  thread_count: number;
}

interface LeadSource {
  lead_source: string;
  lead_count: number;
  total_value: number;
  avg_value: number;
  avg_probability: number;
}

interface RevenueAtRisk {
  total_at_risk: number;
  thread_count: number;
  threads: Array<{
    thread_id: string;
    estimated_value: number;
    risk_reason: string;
    pipeline_stage: string;
  }>;
}

interface Trend {
  date: string;
  jobs_closed_count: number;
  revenue_booked: number;
  estimates_booked_count: number;
  estimate_value: number;
}

interface RevenueViewProps {
  campaignId: string;
}

const PIPELINE_STAGE_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  estimate_scheduled: "Estimate Scheduled",
  estimate_completed: "Estimate Completed",
  pending_decision: "Pending Decision",
  won: "Won",
  lost: "Lost",
};

export function RevenueView({ campaignId }: RevenueViewProps) {
  const [pipelineTotals, setPipelineTotals] = useState<PipelineTotals | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [atRisk, setAtRisk] = useState<RevenueAtRisk | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [pipelineRes, forecastRes, sourcesRes, atRiskRes, trendsRes] =
          await Promise.all([
            fetch(`/api/inbox/revenue/pipeline?campaign_id=${campaignId}`),
            fetch(`/api/inbox/revenue/forecast?campaign_id=${campaignId}`),
            fetch(`/api/inbox/revenue/by-source?campaign_id=${campaignId}`),
            fetch(`/api/inbox/revenue/at-risk?campaign_id=${campaignId}`),
            fetch(`/api/inbox/revenue/trends?campaign_id=${campaignId}&days=30`),
          ]);

        if (pipelineRes.ok) {
          setPipelineTotals(await pipelineRes.json());
        }
        if (forecastRes.ok) {
          setForecast(await forecastRes.json());
        }
        if (sourcesRes.ok) {
          const data = await sourcesRes.json();
          setSources(data.sources || []);
        }
        if (atRiskRes.ok) {
          setAtRisk(await atRiskRes.json());
        }
        if (trendsRes.ok) {
          const data = await trendsRes.json();
          setTrends(data.trends || []);
        }
      } catch (error) {
        console.error("Error fetching revenue data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
    // Refresh every 60 seconds
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, [campaignId]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-64 bg-gray-200 animate-pulse rounded-lg" />
        <div className="h-64 bg-gray-200 animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="pipeline" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        {/* Pipeline Tab */}
        <TabsContent value="pipeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Pipeline Revenue Totals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pipelineTotals && (
                <div className="space-y-4">
                  <div className="text-2xl font-bold text-green-600">
                    Total Pipeline: {formatCurrency(pipelineTotals.total_pipeline)}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pipelineTotals.totals.map((total) => (
                      <Card key={total.pipeline_stage} className="p-4">
                        <div className="text-sm text-gray-600 mb-1">
                          {PIPELINE_STAGE_LABELS[total.pipeline_stage] ||
                            total.pipeline_stage}
                        </div>
                        <div className="text-xl font-bold text-gray-900">
                          {formatCurrency(total.total_revenue)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {total.thread_count} leads · Avg:{" "}
                          {formatCurrency(total.avg_revenue)} ·{" "}
                          {Math.round(total.avg_probability)}% probability
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revenue at Risk */}
          {atRisk && atRisk.total_at_risk > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="w-5 h-5" />
                  Revenue at Risk: {formatCurrency(atRisk.total_at_risk)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-700 mb-3">
                  {atRisk.thread_count} leads need attention
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {atRisk.threads.slice(0, 10).map((thread) => (
                    <div
                      key={thread.thread_id}
                      className="flex items-center justify-between p-2 bg-white rounded border"
                    >
                      <div className="text-sm">
                        <span className="font-medium">
                          {formatCurrency(thread.estimated_value)}
                        </span>
                        <span className="text-gray-500 ml-2">
                          {thread.risk_reason.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {PIPELINE_STAGE_LABELS[thread.pipeline_stage]}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Forecast Tab */}
        <TabsContent value="forecast" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Revenue Forecast (Next 30 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {forecast && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="p-4 border-blue-200">
                      <div className="text-sm text-gray-600 mb-1">
                        Forecasted Revenue
                      </div>
                      <div className="text-2xl font-bold text-blue-600">
                        {formatCurrency(forecast.forecasted_revenue)}
                      </div>
                    </Card>
                    <Card className="p-4 border-green-200">
                      <div className="text-sm text-gray-600 mb-1">Best Case</div>
                      <div className="text-2xl font-bold text-green-600">
                        {formatCurrency(forecast.best_case_revenue)}
                      </div>
                    </Card>
                    <Card className="p-4 border-orange-200">
                      <div className="text-sm text-gray-600 mb-1">Worst Case</div>
                      <div className="text-2xl font-bold text-orange-600">
                        {formatCurrency(forecast.worst_case_revenue)}
                      </div>
                    </Card>
                  </div>
                  <div className="text-sm text-gray-600">
                    Based on {forecast.thread_count} active leads
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sources Tab */}
        <TabsContent value="sources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Lead Value by Source
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sources.map((source) => (
                  <div
                    key={source.lead_source}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <div className="font-medium text-gray-900">
                        {source.lead_source.replace(/_/g, " ").replace(/\b\w/g, (l) =>
                          l.toUpperCase()
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {source.lead_count} leads · Avg:{" "}
                        {formatCurrency(source.avg_value)} ·{" "}
                        {Math.round(source.avg_probability)}% probability
                      </div>
                    </div>
                    <div className="text-xl font-bold text-green-600">
                      {formatCurrency(source.total_value)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Weekly Revenue Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {trends.slice(0, 30).map((trend) => (
                  <div
                    key={trend.date}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <div className="font-medium text-gray-900">
                        {new Date(trend.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <div className="text-xs text-gray-500">
                        {trend.jobs_closed_count} jobs closed ·{" "}
                        {trend.estimates_booked_count} estimates booked
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-green-600">
                        {formatCurrency(trend.revenue_booked)}
                      </div>
                      {trend.estimate_value > 0 && (
                        <div className="text-xs text-yellow-600">
                          {formatCurrency(trend.estimate_value)} in estimates
                        </div>
                      )}
                    </div>
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



















































