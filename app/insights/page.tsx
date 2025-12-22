"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Mail, MessageSquare, Calendar, Send, AlertTriangle, CheckCircle, BarChart3, PieChart, Activity, Sparkles, Phone, Smartphone, Landline } from "lucide-react";
import Link from "next/link";

interface InsightsData {
  replies_today: number;
  high_intent_replies: number;
  meetings_detected: number;
  send_volume_today: number;
  send_plan_capacity: number;
  bounce_rate_7d: number;
  mailbox_health: Array<{ email: string; health: number; bounce_rate?: number }>;
  pipeline: {
    active: number;
    meetings: number;
    proposal: number;
    closed_won: number;
    closed_lost: number;
  };
  template_performance: Array<{
    template_id: string;
    template_name?: string;
    opens: number;
    replies: number;
    meetings: number;
    reply_rate?: number;
  }>;
  enrichment_score_avg: number;
  enrichment_summary: {
    enriched_count: number;
    missing_domain: number;
    needs_re_enrichment: number;
  };
  ai_insights: string[];
  playbook_performance?: Array<{
    playbook_id: string;
    playbook_name: string;
    campaigns_count: number;
    total_sent: number;
    total_replies: number;
    total_meetings: number;
    avg_reply_rate: number;
    avg_meeting_rate: number;
    total_pipeline: number;
  }>;
}

interface PhoneQualityData {
  total: number;
  lineTypes: {
    mobile: number;
    landline: number;
    voip: number;
    mobilePercent: number;
    landlinePercent: number;
    voipPercent: number;
  };
  status: {
    valid: number;
    disconnected: number;
    validPercent: number;
    disconnectedPercent: number;
  };
  sms: {
    ready: number;
    readyPercent: number;
  };
  qualityDistribution: {
    high: number;
    normal: number;
    low: number;
    suspect: number;
    highPercent: number;
    normalPercent: number;
    lowPercent: number;
    suspectPercent: number;
  };
  homeownerDistribution: {
    high: number;
    medium: number;
    low: number;
    unlikely: number;
    highPercent: number;
    mediumPercent: number;
    lowPercent: number;
    unlikelyPercent: number;
  };
  averageQualityScore: number;
}

export default function InsightsPage() {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playbookPerformance, setPlaybookPerformance] = useState<
    InsightsData["playbook_performance"]
  >(undefined);
  const [phoneQuality, setPhoneQuality] = useState<PhoneQualityData | null>(null);

  useEffect(() => {
    fetchInsights();
    fetchPhoneQuality();
  }, []);

  const fetchInsights = async () => {
    try {
      const res = await fetch("/api/insights");
      if (!res.ok) throw new Error("Failed to fetch insights");
      const data = await res.json();
      setInsights(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insights");
    } finally {
      setLoading(false);
    }
  };

  const fetchPhoneQuality = async () => {
    try {
      const res = await fetch("/api/insights/phone-quality");
      if (res.ok) {
        const data = await res.json();
        setPhoneQuality(data);
      }
    } catch (err) {
      console.error("Error fetching phone quality:", err);
    }
  };

  useEffect(() => {
    fetchPlaybookPerformance();
  }, []);

  const fetchPlaybookPerformance = async () => {
    try {
      const res = await fetch("/api/playbooks/performance");
      if (res.ok) {
        const data = await res.json();
        setPlaybookPerformance(data.performance || []);
      }
    } catch (err) {
      console.error("Error fetching playbook performance:", err);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-gray-600">No insights data available yet. Insights are generated hourly.</p>
        </div>
      </div>
    );
  }

  const sendProgress = insights.send_plan_capacity > 0
    ? Math.round((insights.send_volume_today / insights.send_plan_capacity) * 100)
    : 0;

  const replyBreakdown = {
    meeting_intent: insights.meetings_detected,
    interested: insights.high_intent_replies - insights.meetings_detected,
    neutral: Math.max(0, insights.replies_today - insights.high_intent_replies),
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">SmartSend Insights</h1>
          <p className="text-muted-foreground mt-1">Executive dashboard for outbound performance</p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* Top Row KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard
          title="Replies Today"
          value={insights.replies_today}
          icon={<MessageSquare className="h-5 w-5" />}
          trend={insights.replies_today > 0 ? "+18%" : undefined}
          trendUp={true}
        />
        <KPICard
          title="High Intent"
          value={insights.high_intent_replies}
          icon={<TrendingUp className="h-5 w-5" />}
          subtitle={`${insights.meetings_detected} meetings`}
        />
        <KPICard
          title="Meetings"
          value={insights.meetings_detected}
          icon={<Calendar className="h-5 w-5" />}
        />
        <KPICard
          title="Send Progress"
          value={`${insights.send_volume_today} / ${insights.send_plan_capacity}`}
          icon={<Send className="h-5 w-5" />}
          subtitle={`${sendProgress}%`}
          trendUp={sendProgress >= 75}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Reply Breakdown Chart */}
          <div className="border rounded-lg p-6 bg-card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Reply Breakdown
            </h2>
            <div className="space-y-3">
              {Object.entries(replyBreakdown).map(([label, count]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{label.replace("_", " ")}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{
                          width: `${insights.replies_today > 0 ? (count / insights.replies_today) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Template Performance */}
          <div className="border rounded-lg p-6 bg-card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Template Performance
            </h2>
            {insights.template_performance.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Template Variant</th>
                      <th className="text-right py-2">Opens</th>
                      <th className="text-right py-2">Replies</th>
                      <th className="text-right py-2">Meetings</th>
                      <th className="text-right py-2">Reply Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.template_performance.map((template) => (
                      <tr key={template.template_id} className="border-b">
                        <td className="py-2">{template.template_name || "Unnamed"}</td>
                        <td className="text-right py-2">{template.opens}</td>
                        <td className="text-right py-2">{template.replies}</td>
                        <td className="text-right py-2">{template.meetings}</td>
                        <td className="text-right py-2 font-medium">
                          {template.reply_rate?.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No template performance data yet</p>
            )}
          </div>
        </div>

        {/* Playbook Performance */}
        {playbookPerformance && playbookPerformance.length > 0 && (
          <div className="border rounded-lg p-6 bg-card">
            <h2 className="text-lg font-semibold mb-4">Playbook Performance (Last 30 Days)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Playbook Name</th>
                    <th className="py-2 pr-4 text-right">Campaigns</th>
                    <th className="py-2 pr-4 text-right">Sent</th>
                    <th className="py-2 pr-4 text-right">Replies</th>
                    <th className="py-2 pr-4 text-right">Meetings</th>
                    <th className="py-2 pr-4 text-right">Avg Reply Rate</th>
                    <th className="py-2 pr-4 text-right">Avg Meeting Rate</th>
                    <th className="py-2 text-right">Pipeline</th>
                  </tr>
                </thead>
                <tbody>
                  {playbookPerformance.map((playbook) => (
                    <tr key={playbook.playbook_id} className="border-b">
                      <td className="py-2 pr-4 font-medium">{playbook.playbook_name}</td>
                      <td className="py-2 pr-4 text-right">{playbook.campaigns_count}</td>
                      <td className="py-2 pr-4 text-right">{playbook.total_sent}</td>
                      <td className="py-2 pr-4 text-right">{playbook.total_replies}</td>
                      <td className="py-2 pr-4 text-right">{playbook.total_meetings}</td>
                      <td className="py-2 pr-4 text-right font-medium">
                        {playbook.avg_reply_rate.toFixed(1)}%
                      </td>
                      <td className="py-2 pr-4 text-right font-medium">
                        {playbook.avg_meeting_rate.toFixed(1)}%
                      </td>
                      <td className="py-2 text-right">{playbook.total_pipeline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Link
              href="/playbooks"
              className="text-xs text-muted-foreground hover:text-foreground mt-4 block"
            >
              View All Playbooks →
            </Link>
          </div>
        )}

        {/* Right Column */}
        <div className="space-y-6">
          {/* Mailbox Health */}
          <div className="border rounded-lg p-6 bg-card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Mailbox Health
            </h2>
            <div className="space-y-3">
              {insights.mailbox_health.length > 0 ? (
                insights.mailbox_health.map((mailbox, idx) => (
                  <Link
                    key={idx}
                    href="/dashboard/deliverability"
                    className="block p-3 border rounded-lg hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{mailbox.email}</span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          mailbox.health >= 80
                            ? "bg-green-100 text-green-800"
                            : mailbox.health >= 60
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {mailbox.health >= 80 ? "OK" : mailbox.health >= 60 ? "Caution" : "Warning"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Health: {mailbox.health}/100</span>
                      {mailbox.bounce_rate !== undefined && (
                        <span>Bounce: {mailbox.bounce_rate.toFixed(1)}%</span>
                      )}
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No mailbox data available</p>
              )}
            </div>
          </div>

          {/* Pipeline Snapshot */}
          <div className="border rounded-lg p-6 bg-card">
            <h2 className="text-lg font-semibold mb-4">Pipeline Snapshot</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm">Active Deals</span>
                <span className="text-sm font-medium">{insights.pipeline.active}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Meetings</span>
                <span className="text-sm font-medium">{insights.pipeline.meetings}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Proposals</span>
                <span className="text-sm font-medium">{insights.pipeline.proposal}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-sm">Closed Won</span>
                <span className="text-sm font-medium text-green-600">
                  {insights.pipeline.closed_won}
                </span>
              </div>
            </div>
            <Link
              href="/dashboard/pipeline"
              className="text-xs text-muted-foreground hover:text-foreground mt-4 block"
            >
              View Full Pipeline →
            </Link>
          </div>

          {/* Enrichment Panel */}
          <div className="border rounded-lg p-6 bg-card">
            <h2 className="text-lg font-semibold mb-4">Enrichment Health</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Average Score</span>
                <span className="text-lg font-bold">{insights.enrichment_score_avg}/100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Enriched Companies</span>
                <span className="text-sm font-medium">{insights.enrichment_summary.enriched_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Missing Domain</span>
                <span className="text-sm font-medium">{insights.enrichment_summary.missing_domain}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Needs Re-Enrichment</span>
                <span className="text-sm font-medium">
                  {insights.enrichment_summary.needs_re_enrichment}
                </span>
              </div>
            </div>
            <Link
              href="/dashboard/leads"
              className="text-xs text-muted-foreground hover:text-foreground mt-4 block"
            >
              View Enrichment Engine →
            </Link>
          </div>

          {/* Phone Quality Panel - Block 17900 */}
          {phoneQuality && phoneQuality.total > 0 && (
            <div className="border rounded-lg p-6 bg-card">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Phone Quality
              </h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Average Quality Score</span>
                  <span className="text-lg font-bold">{phoneQuality.averageQualityScore}/100</span>
                </div>
                
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Line Types</div>
                  <div className="flex justify-between">
                    <span className="text-sm flex items-center gap-1">
                      <Smartphone className="h-3 w-3" />
                      Mobile
                    </span>
                    <span className="text-sm font-medium">
                      {phoneQuality.lineTypes.mobile} ({phoneQuality.lineTypes.mobilePercent}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm flex items-center gap-1">
                      <Landline className="h-3 w-3" />
                      Landline
                    </span>
                    <span className="text-sm font-medium">
                      {phoneQuality.lineTypes.landline} ({phoneQuality.lineTypes.landlinePercent}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">VOIP</span>
                    <span className="text-sm font-medium">
                      {phoneQuality.lineTypes.voip} ({phoneQuality.lineTypes.voipPercent}%)
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">SMS Readiness</div>
                  <div className="flex justify-between">
                    <span className="text-sm">SMS Ready</span>
                    <span className="text-sm font-medium text-green-600">
                      {phoneQuality.sms.ready} ({phoneQuality.sms.readyPercent}%)
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Quality Distribution</div>
                  <div className="flex justify-between">
                    <span className="text-sm text-green-600">High (90+)</span>
                    <span className="text-sm font-medium">{phoneQuality.qualityDistribution.high}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-blue-600">Normal (70-89)</span>
                    <span className="text-sm font-medium">{phoneQuality.qualityDistribution.normal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-yellow-600">Low (50-69)</span>
                    <span className="text-sm font-medium">{phoneQuality.qualityDistribution.low}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-red-600">Suspect (&lt;50)</span>
                    <span className="text-sm font-medium">{phoneQuality.qualityDistribution.suspect}</span>
                  </div>
                </div>
              </div>
              <Link
                href="/data-tools/phone-audit"
                className="text-xs text-muted-foreground hover:text-foreground mt-4 block"
              >
                View Phone Audit Tool →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* AI Insights Stream */}
      {insights.ai_insights && insights.ai_insights.length > 0 && (
        <div className="border rounded-lg p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Insights
          </h2>
          <div className="space-y-3">
            {insights.ai_insights.map((insight, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 bg-white dark:bg-gray-900 rounded-lg border"
              >
                <div className="p-1 bg-purple-100 dark:bg-purple-900 rounded">
                  <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <p className="text-sm flex-1">{insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({
  title,
  value,
  icon,
  trend,
  trendUp,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  subtitle?: string;
}) {
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        {trend && (
          <span
            className={`text-xs font-medium flex items-center gap-1 ${
              trendUp ? "text-green-600" : "text-red-600"
            }`}
          >
            {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
    </div>
  );
}


