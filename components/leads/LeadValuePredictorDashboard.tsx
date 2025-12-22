// Block 80000 — SmartSend Roofing
// "Job Value Predictor + Profit Probability AI" v1
// Priority Sorting Dashboard Component

"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, DollarSign, Target, MapPin, BarChart3, RefreshCw } from "lucide-react";
import Link from "next/link";

interface LeadWithPrediction {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  status?: string | null;
  prediction?: {
    predicted_job_value: number;
    close_probability: number;
    profit_score: number;
    recommended_priority: "High" | "Medium" | "Low";
    reasoning: string;
  } | null;
}

interface ZipcodeStats {
  zipcode: string;
  total_jobs: number;
  closed_jobs: number;
  avg_job_value: number;
  close_rate: number;
  total_revenue: number;
}

interface LeadValuePredictorDashboardProps {
  workspaceId: string;
  className?: string;
}

export function LeadValuePredictorDashboard({
  workspaceId,
  className = "",
}: LeadValuePredictorDashboardProps) {
  const [activeTab, setActiveTab] = useState<string>("high-profit");
  const [leads, setLeads] = useState<LeadWithPrediction[]>([]);
  const [zipcodeStats, setZipcodeStats] = useState<ZipcodeStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchLeads(sortBy: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/leads/predictions?workspace_id=${workspaceId}&sort_by=${sortBy}&limit=50`);
      if (response.ok) {
        const data = await response.json();
        setLeads(data.leads || []);
      }
    } catch (error) {
      console.error("Error fetching leads:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchZipcodeStats() {
    try {
      const response = await fetch(`/api/leads/predictions/zipcode-stats?workspace_id=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        setZipcodeStats(data.stats || []);
      }
    } catch (error) {
      console.error("Error fetching ZIP code stats:", error);
    }
  }

  async function refreshAll() {
    setRefreshing(true);
    await Promise.all([
      fetchLeads(activeTab),
      fetchZipcodeStats(),
    ]);
    setRefreshing(false);
  }

  useEffect(() => {
    if (workspaceId) {
      fetchLeads(activeTab);
      fetchZipcodeStats();
    }
  }, [workspaceId, activeTab]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "Medium":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "Low":
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getProfitScoreColor = (score: number) => {
    if (score >= 70) return "text-green-400";
    if (score >= 40) return "text-yellow-400";
    return "text-gray-400";
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Target className="w-6 h-6" />
            Job Value Predictor Dashboard
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            AI-powered lead prioritization to maximize your profit
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshAll}
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="high-profit">High Profit</TabsTrigger>
          <TabsTrigger value="high-value">High Value</TabsTrigger>
          <TabsTrigger value="high-close">High Close Rate</TabsTrigger>
          <TabsTrigger value="storm-impact">Storm Impact</TabsTrigger>
          <TabsTrigger value="insurance-likely">Insurance Likely</TabsTrigger>
        </TabsList>

        {/* High Profit Leads */}
        <TabsContent value="high-profit" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                High Profit Score Leads
              </CardTitle>
              <CardDescription>
                Leads sorted by Profit Score™ — the master metric combining value and probability
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-white/5 rounded animate-pulse" />
                  ))}
                </div>
              ) : leads.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  No leads with predictions yet. Predictions are generated automatically.
                </p>
              ) : (
                <div className="space-y-3">
                  {leads.map((lead) => (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="block p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-white">
                              {lead.first_name && lead.last_name
                                ? `${lead.first_name} ${lead.last_name}`
                                : lead.email}
                            </h3>
                            {lead.prediction && (
                              <Badge className={getPriorityColor(lead.prediction.recommended_priority)}>
                                {lead.prediction.recommended_priority}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-400 mb-3">{lead.email}</p>
                          {lead.prediction && (
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-gray-400">Profit Score:</span>
                                <span className={`ml-2 font-bold ${getProfitScoreColor(lead.prediction.profit_score)}`}>
                                  {Math.round(lead.prediction.profit_score)}/100
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">Job Value:</span>
                                <span className="ml-2 font-bold text-white">
                                  ${Math.round(lead.prediction.predicted_job_value).toLocaleString()}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">Close Prob:</span>
                                <span className="ml-2 font-bold text-white">
                                  {Math.round(lead.prediction.close_probability * 100)}%
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* High Value Leads */}
        <TabsContent value="high-value" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                High Value Leads
              </CardTitle>
              <CardDescription>
                Leads with highest predicted job values
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-white/5 rounded animate-pulse" />
                  ))}
                </div>
              ) : leads.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No high-value leads found.</p>
              ) : (
                <div className="space-y-3">
                  {leads.map((lead) => (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="block p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-white mb-1">
                            {lead.first_name && lead.last_name
                              ? `${lead.first_name} ${lead.last_name}`
                              : lead.email}
                          </h3>
                          <p className="text-sm text-gray-400 mb-2">{lead.email}</p>
                          {lead.prediction && (
                            <div className="text-2xl font-bold text-green-400">
                              ${Math.round(lead.prediction.predicted_job_value).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* High Close Probability */}
        <TabsContent value="high-close" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                High Close Probability Leads
              </CardTitle>
              <CardDescription>
                Leads most likely to close based on historical data
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-white/5 rounded animate-pulse" />
                  ))}
                </div>
              ) : leads.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No high-close-probability leads found.</p>
              ) : (
                <div className="space-y-3">
                  {leads.map((lead) => (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="block p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-white mb-1">
                            {lead.first_name && lead.last_name
                              ? `${lead.first_name} ${lead.last_name}`
                              : lead.email}
                          </h3>
                          <p className="text-sm text-gray-400 mb-2">{lead.email}</p>
                          {lead.prediction && (
                            <div className="text-2xl font-bold text-blue-400">
                              {Math.round(lead.prediction.close_probability * 100)}% Close Rate
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Storm Impact */}
        <TabsContent value="storm-impact" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Storm Impact Leads</CardTitle>
              <CardDescription>
                Leads from areas with recent storm activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-400 text-center py-8">
                Storm impact analysis coming soon. This will show leads from ZIP codes with recent storm activity.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insurance Likely */}
        <TabsContent value="insurance-likely" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Insurance Likely Leads</CardTitle>
              <CardDescription>
                Leads likely to involve insurance claims
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-400 text-center py-8">
                Insurance likelihood analysis coming soon. This will identify leads with high insurance claim probability.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Training Data Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Training Data Insights
          </CardTitle>
          <CardDescription>
            Top performing ZIP codes and job types based on historical data
          </CardDescription>
        </CardHeader>
        <CardContent>
          {zipcodeStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No training data yet. Start closing jobs to build predictive insights.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Top ZIP Codes by Revenue
                </h4>
                <div className="space-y-2">
                  {zipcodeStats.slice(0, 10).map((stat) => (
                    <div
                      key={stat.zipcode}
                      className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5"
                    >
                      <div>
                        <div className="font-semibold text-white">{stat.zipcode}</div>
                        <div className="text-xs text-gray-400">
                          {stat.closed_jobs}/{stat.total_jobs} jobs closed ({Math.round(stat.close_rate * 100)}% rate)
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-400">
                          ${Math.round(stat.total_revenue).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-400">
                          Avg: ${Math.round(stat.avg_job_value).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



























