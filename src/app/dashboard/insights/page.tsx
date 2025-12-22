"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  Users,
  CloudRain,
  Shield,
  MessageSquare,
  BarChart3,
  Calendar,
  Clock,
  Zap,
  Target,
  ArrowRight,
} from "lucide-react";

interface DashboardData {
  lead_intelligence: any;
  storm_insights: any;
  insurance_intelligence: any;
  reply_insights: any;
  conversion_insights: any;
  campaign_insights: any;
  appointment_insights: any;
  timeline_insights: any;
}

interface DangerReport {
  report_date: string;
  total_danger_items: number;
  priority_breakdown: {
    high: number;
    medium: number;
    low: number;
  };
  revenue_at_risk: number;
  danger_items: any[];
}

interface PriorityPlan {
  generated_at: string;
  total_actions: number;
  priority_plan: any[];
  summary: {
    high_priority: number;
    medium_priority: number;
    low_priority: number;
  };
}

export default function InsightsDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dangerReport, setDangerReport] = useState<DangerReport | null>(null);
  const [priorityPlan, setPriorityPlan] = useState<PriorityPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    fetchDangerReport();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const res = await fetch("/api/insights/dashboard");
      const data = await res.json();
      setDashboardData(data);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDangerReport = async () => {
    try {
      const res = await fetch("/api/insights/danger-report");
      const data = await res.json();
      setDangerReport(data);
    } catch (error) {
      console.error("Failed to fetch danger report:", error);
    }
  };

  const fetchPriorityPlan = async () => {
    setLoadingPlan(true);
    try {
      const res = await fetch("/api/insights/what-should-i-do", {
        method: "POST",
      });
      const data = await res.json();
      setPriorityPlan(data);
    } catch (error) {
      console.error("Failed to fetch priority plan:", error);
    } finally {
      setLoadingPlan(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading insights...</div>
        </div>
      </div>
    );
  }

  const data = dashboardData || {
    lead_intelligence: {},
    storm_insights: {},
    insurance_intelligence: {},
    reply_insights: {},
    conversion_insights: {},
    campaign_insights: {},
    appointment_insights: {},
    timeline_insights: {},
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">SmartSend Insights v2</h1>
          <p className="text-gray-600 mt-1">
            The Roofer Intelligence Dashboard: Lead Heat, Storm Impact, Insurance Signals & More
          </p>
        </div>
        <Button
          onClick={fetchPriorityPlan}
          disabled={loadingPlan}
          className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
        >
          <Zap className="w-4 h-4 mr-2" />
          {loadingPlan ? "Generating..." : "What Should I Do Today?"}
        </Button>
      </div>

      {/* Priority Plan Modal */}
      {priorityPlan && (
        <Card className="border-yellow-500 border-2 bg-yellow-50 dark:bg-yellow-900/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-yellow-600" />
              Your Daily Priority Plan
            </CardTitle>
            <CardDescription>
              {priorityPlan.total_actions} actions • {priorityPlan.summary.high_priority} high priority
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {priorityPlan.priority_plan.map((action, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge
                          variant={
                            action.priority === "high"
                              ? "destructive"
                              : action.priority === "medium"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {action.priority}
                        </Badge>
                        <span className="font-semibold capitalize">
                          {action.action.replace(/_/g, " ")}
                        </span>
                        <span className="text-sm text-gray-500">({action.count} items)</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{action.reason}</p>
                      {action.items && action.items.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {action.items.slice(0, 3).map((item: any, itemIdx: number) => (
                            <div key={itemIdx} className="text-xs text-gray-500">
                              • {item.name || item.email || item.title || "Item"}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Danger Report */}
      {dangerReport && dangerReport.total_danger_items > 0 && (
        <Card className="border-red-500 border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              ⚠️ Danger Report - {dangerReport.report_date}
            </CardTitle>
            <CardDescription>
              {dangerReport.total_danger_items} items need attention • $
              {dangerReport.revenue_at_risk.toLocaleString()} at risk
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-red-100 dark:bg-red-900/20 rounded">
                <div className="text-2xl font-bold text-red-600">
                  {dangerReport.priority_breakdown.high}
                </div>
                <div className="text-sm text-gray-600">High Priority</div>
              </div>
              <div className="text-center p-3 bg-yellow-100 dark:bg-yellow-900/20 rounded">
                <div className="text-2xl font-bold text-yellow-600">
                  {dangerReport.priority_breakdown.medium}
                </div>
                <div className="text-sm text-gray-600">Medium Priority</div>
              </div>
              <div className="text-center p-3 bg-blue-100 dark:bg-blue-900/20 rounded">
                <div className="text-2xl font-bold text-blue-600">
                  {dangerReport.priority_breakdown.low}
                </div>
                <div className="text-sm text-gray-600">Low Priority</div>
              </div>
            </div>
            <div className="space-y-2">
              {dangerReport.danger_items.slice(0, 5).map((item, idx) => (
                <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                  <Badge
                    variant={
                      item.priority === "high"
                        ? "destructive"
                        : item.priority === "medium"
                        ? "default"
                        : "secondary"
                    }
                    className="mr-2"
                  >
                    {item.priority}
                  </Badge>
                  <span className="font-semibold capitalize">{item.type.replace(/_/g, " ")}</span>
                  <span className="text-gray-500 ml-2">({item.count} items)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Money on the Table */}
      <Card className="border-yellow-500 border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-yellow-500" />
            Money on the Table
          </CardTitle>
          <CardDescription>Revenue opportunities that need action</CardDescription>
        </CardHeader>
        <CardContent>
          <MoneyOnTablePanel />
        </CardContent>
      </Card>

      {/* 5 Major Insight Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1️⃣ Lead Intelligence Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              1️⃣ Lead Intelligence
            </CardTitle>
            <CardDescription>Lead heat, status breakdown, high-value leads</CardDescription>
          </CardHeader>
          <CardContent>
            <LeadIntelligencePanel data={data.lead_intelligence} />
          </CardContent>
        </Card>

        {/* 2️⃣ Storm Insights Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CloudRain className="w-5 h-5" />
              2️⃣ Storm Insights
            </CardTitle>
            <CardDescription>Storm-affected areas, hail/wind data, storm revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <StormInsightsPanel data={data.storm_insights} />
          </CardContent>
        </Card>

        {/* 3️⃣ Insurance Intelligence Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              3️⃣ Insurance Intelligence
            </CardTitle>
            <CardDescription>Claims, adjusters, insurance win rates</CardDescription>
          </CardHeader>
          <CardContent>
            <InsuranceIntelligencePanel data={data.insurance_intelligence} />
          </CardContent>
        </Card>

        {/* 4️⃣ Reply & Follow-Up Insights */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              4️⃣ Reply & Follow-Up Insights
            </CardTitle>
            <CardDescription>Reply rates, response times, stalled conversations</CardDescription>
          </CardHeader>
          <CardContent>
            <ReplyInsightsPanel data={data.reply_insights} />
          </CardContent>
        </Card>

        {/* 5️⃣ Conversion Path Insights */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              5️⃣ Conversion Path Insights (Elite)
            </CardTitle>
            <CardDescription>
              Stage-by-stage flow: Cold → Warm → Hot → Appointment → Quote → Won
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConversionInsightsPanel data={data.conversion_insights} />
          </CardContent>
        </Card>
      </div>

      {/* Campaign & Appointment Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Campaign Insights
            </CardTitle>
            <CardDescription>Best performers, timing, list performance</CardDescription>
          </CardHeader>
          <CardContent>
            <CampaignInsightsPanel data={data.campaign_insights} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Appointment Insights
            </CardTitle>
            <CardDescription>Booking rates, no-shows, best times</CardDescription>
          </CardHeader>
          <CardContent>
            <AppointmentInsightsPanel data={data.appointment_insights} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Component: Money on the Table Panel
function MoneyOnTablePanel() {
  const [revenueData, setRevenueData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/insights/revenue")
      .then((res) => res.json())
      .then((data) => {
        setRevenueData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-500">Loading...</div>;
  if (!revenueData) return <div className="text-gray-500">No data available</div>;

  const total = revenueData.total_revenue_at_risk || 0;

  return (
    <div>
      <div className="text-4xl font-bold text-yellow-600 mb-4">
        ${total.toLocaleString()}
      </div>
      <p className="text-gray-600 mb-4">in potential revenue needs action today</p>
      <div className="space-y-2">
        {Object.entries(revenueData.breakdown || {}).map(([key, value]: [string, any]) => (
          <div key={key} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <span className="capitalize text-sm">{key.replace(/_/g, " ")}</span>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">{value.count} items</span>
              <span className="font-semibold">${value.revenue.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Component: Lead Intelligence Panel
function LeadIntelligencePanel({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-2xl font-bold">{data.avg_lead_heat?.toFixed(1) || 0}</div>
          <div className="text-xs text-gray-500">Avg Lead Heat</div>
        </div>
        <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded">
          <div className="text-2xl font-bold text-red-600">{data.hot_leads_count || 0}</div>
          <div className="text-xs text-gray-500">Hot Leads</div>
        </div>
        <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded">
          <div className="text-2xl font-bold text-yellow-600">{data.warm_leads_count || 0}</div>
          <div className="text-xs text-gray-500">Warm Leads</div>
        </div>
        <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
          <div className="text-2xl font-bold text-blue-600">{data.cold_leads_count || 0}</div>
          <div className="text-xs text-gray-500">Cold Leads</div>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Leads Needing Reply</span>
          <span className="font-semibold">{data.leads_needing_reply || 0}</span>
        </div>
        <div className="flex justify-between">
          <span>Neglected Leads</span>
          <span className="font-semibold text-red-600">{data.neglected_leads || 0}</span>
        </div>
        <div className="flex justify-between">
          <span>High-Value Leads</span>
          <span className="font-semibold text-yellow-600">{data.high_value_leads || 0}</span>
        </div>
        <div className="flex justify-between">
          <span>Insurance Leads</span>
          <span className="font-semibold">{data.insurance_leads_count || 0}</span>
        </div>
        <div className="flex justify-between">
          <span>Storm-Affected Leads</span>
          <span className="font-semibold">{data.storm_affected_leads || 0}</span>
        </div>
      </div>
    </div>
  );
}

// Component: Storm Insights Panel
function StormInsightsPanel({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-2xl font-bold">{data.total_storm_homes || 0}</div>
          <div className="text-xs text-gray-500">Storm Homes</div>
        </div>
        <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded">
          <div className="text-2xl font-bold text-red-600">{data.hot_storm_homes || 0}</div>
          <div className="text-xs text-gray-500">Hot Storm Homes</div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Max Hail Size</span>
          <span className="font-semibold">
            {data.max_hail_size ? `${data.max_hail_size}"` : "N/A"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Max Wind Speed</span>
          <span className="font-semibold">
            {data.max_wind_speed ? `${data.max_wind_speed} mph` : "N/A"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Potential Revenue</span>
          <span className="font-semibold text-yellow-600">
            ${(data.potential_storm_revenue || 0).toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Storm-Affected ZIPs</span>
          <span className="font-semibold">{data.storm_affected_zips?.length || 0}</span>
        </div>
      </div>
    </div>
  );
}

// Component: Insurance Intelligence Panel
function InsuranceIntelligencePanel({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-2xl font-bold">{data.insurance_interest_leads || 0}</div>
          <div className="text-xs text-gray-500">Insurance Leads</div>
        </div>
        <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded">
          <div className="text-2xl font-bold text-green-600">{data.filed_claims_count || 0}</div>
          <div className="text-xs text-gray-500">Filed Claims</div>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Expected Payout</span>
          <span className="font-semibold text-yellow-600">
            ${(data.expected_insurance_payout || 0).toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Win Rate</span>
          <span className="font-semibold">{data.insurance_win_rate?.toFixed(1) || 0}%</span>
        </div>
        <div className="flex justify-between">
          <span>Adjuster Scheduled</span>
          <span className="font-semibold">{data.adjuster_scheduled_leads || 0}</span>
        </div>
        <div className="flex justify-between">
          <span>Stalled Leads</span>
          <span className="font-semibold text-red-600">{data.stalled_insurance_leads || 0}</span>
        </div>
      </div>
    </div>
  );
}

// Component: Reply Insights Panel
function ReplyInsightsPanel({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-2xl font-bold">{data.reply_rate?.toFixed(1) || 0}%</div>
          <div className="text-xs text-gray-500">Reply Rate</div>
        </div>
        <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
          <div className="text-2xl font-bold text-blue-600">{data.open_rate?.toFixed(1) || 0}%</div>
          <div className="text-xs text-gray-500">Open Rate</div>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Unread Messages</span>
          <span className="font-semibold">{data.unread_messages_count || 0}</span>
        </div>
        <div className="flex justify-between">
          <span>Avg Response Time</span>
          <span className="font-semibold">{data.avg_response_time_hours?.toFixed(1) || 0} hrs</span>
        </div>
        <div className="flex justify-between">
          <span>Stalled Conversations</span>
          <span className="font-semibold text-red-600">{data.stalled_conversations || 0}</span>
        </div>
        <div className="flex justify-between">
          <span>Messages Needing Follow-Up</span>
          <span className="font-semibold">{data.messages_needing_follow_up || 0}</span>
        </div>
        <div className="flex justify-between">
          <span>Aging Replies</span>
          <span className="font-semibold text-yellow-600">{data.aging_replies || 0}</span>
        </div>
      </div>
    </div>
  );
}

// Component: Conversion Insights Panel
function ConversionInsightsPanel({ data }: { data: any }) {
  const stages = [
    { name: "Cold → Warm", data: data.stage_flow?.cold_to_warm },
    { name: "Warm → Hot", data: data.stage_flow?.warm_to_hot },
    { name: "Hot → Appointment", data: data.stage_flow?.hot_to_appointment },
    { name: "Appointment → Quote", data: data.stage_flow?.appointment_to_quote },
    { name: "Quote → Won", data: data.stage_flow?.quote_to_won },
  ];

  return (
    <div className="space-y-4">
      <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded">
        <div className="text-3xl font-bold text-yellow-600">
          {data.overall_conversion_rate?.toFixed(1) || 0}%
        </div>
        <div className="text-sm text-gray-600">Overall Conversion Rate</div>
      </div>
      <div className="space-y-3">
        {stages.map((stage, idx) => (
          <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">{stage.name}</span>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">{stage.data?.count || 0} conversions</span>
                <span className="font-bold">{stage.data?.rate?.toFixed(1) || 0}%</span>
              </div>
            </div>
            <div className="text-xs text-gray-500">
              Avg {stage.data?.avg_days?.toFixed(1) || 0} days in stage
            </div>
          </div>
        ))}
      </div>
      {data.bottlenecks?.biggest && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded">
          <div className="font-semibold text-red-600">Biggest Bottleneck: {data.bottlenecks.biggest}</div>
          <div className="text-sm text-gray-600 mt-1">{data.bottlenecks.reason}</div>
        </div>
      )}
    </div>
  );
}

// Component: Campaign Insights Panel
function CampaignInsightsPanel({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {data.best_subject_line && (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-xs text-gray-500 mb-1">Best Subject Line</div>
          <div className="font-semibold">{data.best_subject_line}</div>
          <div className="text-sm text-gray-500 mt-1">
            {data.best_subject_line_open_rate?.toFixed(1) || 0}% open rate
          </div>
        </div>
      )}
      {data.best_template_name && (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-xs text-gray-500 mb-1">Best Template</div>
          <div className="font-semibold">{data.best_template_name}</div>
          <div className="text-sm text-gray-500 mt-1">
            {data.best_template_reply_rate?.toFixed(1) || 0}% reply rate
          </div>
        </div>
      )}
      {data.best_time_of_day && (
        <div className="flex justify-between text-sm">
          <span>Best Time</span>
          <span className="font-semibold">{data.best_time_of_day}</span>
        </div>
      )}
      {data.best_day_of_week && (
        <div className="flex justify-between text-sm">
          <span>Best Day</span>
          <span className="font-semibold">{data.best_day_of_week}</span>
        </div>
      )}
    </div>
  );
}

// Component: Appointment Insights Panel
function AppointmentInsightsPanel({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-2xl font-bold">{data.booking_rate?.toFixed(1) || 0}%</div>
          <div className="text-xs text-gray-500">Booking Rate</div>
        </div>
        <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded">
          <div className="text-2xl font-bold text-red-600">{data.no_show_rate?.toFixed(1) || 0}%</div>
          <div className="text-xs text-gray-500">No-Show Rate</div>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        {data.best_appointment_time && (
          <div className="flex justify-between">
            <span>Best Time</span>
            <span className="font-semibold">{data.best_appointment_time}</span>
          </div>
        )}
        {data.best_appointment_day && (
          <div className="flex justify-between">
            <span>Best Day</span>
            <span className="font-semibold">{data.best_appointment_day}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Avg Time to Book</span>
          <span className="font-semibold">{data.avg_time_to_book_hours?.toFixed(1) || 0} hrs</span>
        </div>
        <div className="flex justify-between">
          <span>Avg Time to Close</span>
          <span className="font-semibold">
            {data.avg_time_to_close_after_appointment_days?.toFixed(1) || 0} days
          </span>
        </div>
        <div className="flex justify-between">
          <span>Scheduler Usage</span>
          <span className="font-semibold">{data.scheduler_usage_percent?.toFixed(1) || 0}%</span>
        </div>
      </div>
    </div>
  );
}

